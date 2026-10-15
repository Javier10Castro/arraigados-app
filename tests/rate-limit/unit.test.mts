import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  RULES,
  clientIp,
  guard,
  normalizeIdentity,
  record,
  refund,
  scope,
  setCleanupChanceForTests,
  setStoreTimeoutForTests,
  setRateLimitStoreForTests,
  withAttendeeLimit,
  type Rule,
  type Store,
  type StoreItem,
  type StoreRow,
} from '../../server/rateLimit';

/** Almacén en memoria con el MISMO contrato que el de Neon (ventana fija, reloj inyectable). Solo para pruebas. */
class MemoryStore implements Store {
  now = 1_000_000;
  rows = new Map<string, { count: number; resetAt: number }>();
  calls = 0;
  failWith: unknown = null;
  async consume(items: StoreItem[]): Promise<StoreRow[]> {
    this.calls++;
    if (this.failWith) throw this.failWith;
    return [...items].sort((a, b) => a.key.localeCompare(b.key)).map((i) => {
      const prev = this.rows.get(i.key);
      const row = !prev || prev.resetAt <= this.now ? { count: i.inc, resetAt: this.now + i.windowSec * 1000 } : { count: prev.count + i.inc, resetAt: prev.resetAt };
      this.rows.set(i.key, row);
      return { key: i.key, count: row.count, retryAfter: Math.max(Math.ceil((row.resetAt - this.now) / 1000), 1) };
    });
  }
  async refund(keys: string[]) {
    if (this.failWith) throw this.failWith;
    for (const k of keys) {
      const r = this.rows.get(k);
      if (r && r.resetAt > this.now) r.count = Math.max(r.count - 1, 0);
    }
  }
  async cleanup() {}
}

const R = (max: number, windowSec = 60, onFail: Rule['onFail'] = 'open'): Rule => ({ name: `t${max}_${windowSec}_${onFail}`, max, windowSec, onFail });

let mem: MemoryStore;
const errors: string[] = [];
const origError = console.error;
beforeEach(() => {
  process.env.SESSION_SECRET = 'unit-test-secret-unit-test-secret-1234';
  mem = new MemoryStore();
  setRateLimitStoreForTests(mem);
  setCleanupChanceForTests(0);
  errors.length = 0;
  console.error = (...a: unknown[]) => void errors.push(a.map(String).join(' '));
});
afterEach(() => {
  console.error = origError;
  setRateLimitStoreForTests(null);
});

describe('clientIp: solo context.ip, normalizada', () => {
  it('IPv4 válida se conserva', () => assert.equal(clientIp({ ip: '203.0.113.7' }), '203.0.113.7'));
  it('IPv6: mismo /64 -> misma clave; distinto /64 -> distinta', () => {
    const a = clientIp({ ip: '2001:db8:1:2:aaaa:bbbb:cccc:dddd' });
    const b = clientIp({ ip: '2001:db8:1:2::1' });
    const c = clientIp({ ip: '2001:db8:1:3::1' });
    assert.equal(a, '2001:db8:1:2::/64');
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
  it('IPv6 mapeada de IPv4 -> la IPv4', () => assert.equal(clientIp({ ip: '::ffff:203.0.113.9' }), '203.0.113.9'));
  it('IPv6 abreviada y con zona se normalizan', () => {
    assert.equal(clientIp({ ip: '::1' }), '0:0:0:0::/64');
    assert.equal(clientIp({ ip: 'fe80::1%eth0' }), 'fe80:0:0:0::/64');
  });
  it('sin IP, vacía o basura -> "sin-ip" (nunca se confía en texto arbitrario)', () => {
    for (const ip of [undefined, null, '', ' ', 'abc', '1.2.3.4, 5.6.7.8', '999.1.1.1', '1.2.3.4:80', 12345, {}]) {
      assert.equal(clientIp({ ip }), 'sin-ip', String(ip));
    }
    assert.equal(clientIp(undefined), 'sin-ip');
  });
});

describe('identidades', () => {
  it('normalizeIdentity: mayúsculas, espacios y formas Unicode no cambian la clave', () => {
    assert.equal(normalizeIdentity('  Admin@Test.LOCAL '), 'admin@test.local');
    assert.equal(normalizeIdentity('ＡＤＭＩＮ@test.local'), 'admin@test.local');
    assert.equal(normalizeIdentity(undefined), '');
    assert.equal(normalizeIdentity('x'.repeat(500)).length, 254);
  });
  it('scope: determinista, 32 hex, no contiene la entrada y cambia con cada parte', () => {
    const a = scope('pair', 'admin@test.local', '203.0.113.7');
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.equal(a, scope('pair', 'admin@test.local', '203.0.113.7'));
    assert.notEqual(a, scope('pair', 'admin@test.local', '203.0.113.8'));
    assert.notEqual(scope('a', 'b'), scope('ab'));
    assert.ok(!a.includes('admin') && !a.includes('203'));
  });
  it('scope: otra SESSION_SECRET -> otras huellas; sin secreto lanza', () => {
    const a = scope('x');
    process.env.SESSION_SECRET = 'otra-clave-otra-clave-otra-clave-otra-1';
    assert.notEqual(a, scope('x'));
    delete process.env.SESSION_SECRET;
    assert.throws(() => scope('x'), /SESSION_SECRET/);
  });
});

describe('guard: ventanas, bloqueo y Retry-After', () => {
  it('dentro del límite pasa; la solicitud max+1 recibe 429 con el formato de la API', async () => {
    const rule = R(3, 60);
    for (let i = 0; i < 3; i++) assert.equal(await guard([{ rule, id: 'a' }]), null);
    const res = await guard([{ rule, id: 'a' }]);
    assert.ok(res);
    assert.equal(res.status, 429);
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = (await res.json()) as { error: string; code: string };
    assert.equal(body.code, 'rate_limited');
    assert.equal(body.error, 'Demasiadas solicitudes. Espera 1 min e inténtalo de nuevo.');
    assert.equal(res.headers.get('retry-after'), '60');
    assert.equal(res.headers.get('ratelimit-limit'), '3');
    assert.equal(res.headers.get('ratelimit-remaining'), '0');
    assert.equal(res.headers.get('ratelimit-reset'), '60');
    assert.equal(res.headers.get('ratelimit-policy'), '3;w=60');
  });
  it('Retry-After baja con el tiempo y la ventana se reinicia sola (sin extenderse por insistir)', async () => {
    const rule = R(2, 100);
    await guard([{ rule, id: 'a' }]);
    await guard([{ rule, id: 'a' }]);
    mem.now += 40_000;
    const r1 = await guard([{ rule, id: 'a' }]);
    assert.equal(r1?.headers.get('retry-after'), '60');
    mem.now += 30_000;
    for (let i = 0; i < 5; i++) await guard([{ rule, id: 'a' }]); // insistir no alarga la espera
    const r2 = await guard([{ rule, id: 'a' }]);
    assert.equal(r2?.headers.get('retry-after'), '30');
    mem.now += 30_001;
    assert.equal(await guard([{ rule, id: 'a' }]), null); // ventana nueva
  });
  it('segundos cuando la espera es < 60 s', async () => {
    const rule = R(1, 45);
    await guard([{ rule, id: 'a' }]);
    const res = await guard([{ rule, id: 'a' }]);
    assert.equal(((await res!.json()) as { error: string }).error, 'Demasiadas solicitudes. Espera 45 s e inténtalo de nuevo.');
  });
  it('minutos cuando la espera es >= 60 s', async () => {
    const rule = R(1, 900);
    await guard([{ rule, id: 'a' }]);
    const res = await guard([{ rule, id: 'a' }]);
    assert.match(((await res!.json()) as { error: string }).error, /Espera 15 min e inténtalo/);
  });
  it('identidades independientes: agotar a una no afecta a otra', async () => {
    const rule = R(1);
    await guard([{ rule, id: 'a' }]);
    assert.equal((await guard([{ rule, id: 'a' }]))?.status, 429);
    assert.equal(await guard([{ rule, id: 'b' }]), null);
  });
  it('reglas combinadas: bloquea la peor y el mensaje usa la regla que bloqueó', async () => {
    const strict: Rule = { ...R(1), name: 'strict', message: 'Estricta.' };
    const loose = R(100);
    await guard([{ rule: strict, id: 'x' }, { rule: loose, id: 'y' }]);
    const res = await guard([{ rule: strict, id: 'x' }, { rule: loose, id: 'y' }]);
    assert.equal(res?.status, 429);
    assert.match(((await res!.json()) as { error: string }).error, /^Estricta\./);
  });
  it('inc: 0 solo consulta: no cuenta y bloquea al LLEGAR al máximo', async () => {
    const rule = R(2);
    for (let i = 0; i < 10; i++) assert.equal(await guard([{ rule, id: 'a', inc: 0 }]), null);
    await record([{ rule, id: 'a' }]);
    assert.equal(await guard([{ rule, id: 'a', inc: 0 }]), null);
    await record([{ rule, id: 'a' }]);
    assert.equal((await guard([{ rule, id: 'a', inc: 0 }]))?.status, 429);
  });
  it('claves repetidas en una misma llamada se fusionan (suman)', async () => {
    const rule = R(2);
    assert.equal(await guard([{ rule, id: 'a' }, { rule, id: 'a' }]), null);
    assert.equal((await guard([{ rule, id: 'a' }]))?.status, 429);
  });
  it('refund devuelve 1 y nunca baja de 0', async () => {
    const rule = R(1);
    await guard([{ rule, id: 'a' }]);
    await refund([{ rule, id: 'a' }]);
    assert.equal(await guard([{ rule, id: 'a' }]), null);
    await refund([{ rule, id: 'a' }]);
    await refund([{ rule, id: 'a' }]);
    await refund([{ rule, id: 'a' }]);
    assert.equal(await guard([{ rule, id: 'a' }]), null);
    assert.equal((await guard([{ rule, id: 'a' }]))?.status, 429, 'tras varios refund el contador quedó en 0, no negativo (si no, aún cabrían más)');
  });
});

describe('guard: si el almacén falla', () => {
  it('regla "closed" -> 503 con Retry-After; regla "open" -> deja pasar; siempre se registra', async () => {
    mem.failWith = new Error('conexión rota');
    const closed = await guard([{ rule: R(5, 60, 'closed'), id: 'a' }]);
    assert.equal(closed?.status, 503);
    assert.equal(closed?.headers.get('retry-after'), '5');
    assert.equal(((await closed!.json()) as { code: string }).code, 'rate_limit_unavailable');
    assert.equal(await guard([{ rule: R(5, 60, 'open'), id: 'a' }]), null);
    assert.ok(errors.some((e) => e.includes('[ratelimit] fallo del almacén')));
  });
  it('mezcla open + closed -> se trata como closed', async () => {
    mem.failWith = new Error('x');
    const res = await guard([{ rule: R(5, 60, 'open'), id: 'a' }, { rule: R(5, 60, 'closed'), id: 'b' }]);
    assert.equal(res?.status, 503);
  });
  it('tabla inexistente (42P01): deja pasar incluso las "closed" y avisa que falta la migración', async () => {
    mem.failWith = Object.assign(new Error('relation "RateLimit" does not exist'), { code: '42P01' });
    assert.equal(await guard([{ rule: R(5, 60, 'closed'), id: 'a' }]), null);
    assert.ok(errors.every((e) => !e.includes('relation')), 'no se filtra el texto interno del error');
  });
  it('los logs no incluyen claves, IP ni identidades', async () => {
    mem.failWith = new Error('boom');
    await guard([{ rule: R(5, 60, 'closed'), id: scope('ip', '203.0.113.77') }]);
    assert.ok(errors.length > 0);
    assert.ok(errors.every((e) => !e.includes('203.0.113.77')));
  });
  it('record y refund nunca lanzan aunque falle el almacén', async () => {
    mem.failWith = new Error('x');
    await record([{ rule: R(1), id: 'a' }]);
    await refund([{ rule: R(1), id: 'a' }]);
  });
  it('un almacén que no responde se corta por tiempo (no cuelga la petición): closed -> 503, open -> pasa', async () => {
    setStoreTimeoutForTests(150);
    try {
      setRateLimitStoreForTests({ consume: () => new Promise(() => {}), refund: async () => {}, cleanup: async () => {} });
      const t0 = Date.now();
      assert.equal((await guard([{ rule: R(5, 60, 'closed'), id: 'a' }]))?.status, 503);
      assert.equal(await guard([{ rule: R(5, 60, 'open'), id: 'a' }]), null);
      assert.ok(Date.now() - t0 < 2000);
    } finally {
      setStoreTimeoutForTests(8000);
    }
  });
});

describe('withAttendeeLimit', () => {
  const TOKEN = 'AbCdEfGh12345678';
  const mk = (token: string, headers: Record<string, string> = {}) => new Request('http://x/api/me', { headers: { 'x-pulse-token': token, ...headers } });

  it('token con formato inválido: no gasta cuota ni toca el almacén', async () => {
    let ran = 0;
    const res = await withAttendeeLimit(mk('corto'), { ip: '1.1.1.1' }, R(1), async () => (ran++, new Response('x', { status: 401 })));
    assert.equal(ran, 1);
    assert.equal(res.status, 401);
    assert.equal(mem.calls, 0);
  });
  it('limita por pulsera, no por IP: dos pulseras en la misma IP no se estorban', async () => {
    const rule = R(2);
    const ok = () => Promise.resolve(new Response('ok'));
    const ctx = { ip: '9.9.9.9' };
    assert.equal((await withAttendeeLimit(mk(TOKEN), ctx, rule, ok)).status, 200);
    assert.equal((await withAttendeeLimit(mk(TOKEN), ctx, rule, ok)).status, 200);
    assert.equal((await withAttendeeLimit(mk(TOKEN), ctx, rule, ok)).status, 429);
    assert.equal((await withAttendeeLimit(mk('ZyXwVuTs87654321'), ctx, rule, ok)).status, 200);
  });
  it('un 401 con token bien formado cuenta un fallo contra la IP; un 200 no', async () => {
    const ctx = { ip: '9.9.9.9' };
    await withAttendeeLimit(mk(TOKEN), ctx, R(100), async () => new Response('x', { status: 200 }));
    const before = [...mem.rows.keys()].filter((k) => k.startsWith('bad_token_ip:'));
    assert.equal(mem.rows.get(before[0])?.count, 0);
    await withAttendeeLimit(mk(TOKEN), ctx, R(100), async () => new Response('x', { status: 401 }));
    assert.equal(mem.rows.get(before[0])?.count, 1);
  });
  it('ignora cabeceras de IP del cliente: solo cuenta context.ip', async () => {
    const hit = async (ip: string, spoof: Record<string, string>) =>
      withAttendeeLimit(mk(TOKEN, spoof), { ip }, R(100), async () => new Response('x', { status: 401 }));
    await hit('9.9.9.9', { 'x-forwarded-for': '1.2.3.4', 'x-nf-client-connection-ip': '5.6.7.8', 'x-real-ip': '8.8.8.8', forwarded: 'for=7.7.7.7' });
    await hit('9.9.9.9', { 'x-forwarded-for': '10.0.0.1' });
    const keys = [...mem.rows.entries()].filter(([k]) => k.startsWith('bad_token_ip:'));
    assert.equal(keys.length, 1, 'ambas peticiones cayeron en la MISMA clave (la de context.ip)');
    assert.equal(keys[0][1].count, 2);
  });
});

describe('políticas definidas', () => {
  it('todas tienen nombre único corto (cabe en VARCHAR(80) con la huella) y valores positivos', () => {
    const names = new Set<string>();
    for (const [k, r] of Object.entries(RULES)) {
      assert.equal(r.name, k);
      assert.ok(!names.has(r.name));
      names.add(r.name);
      assert.ok(r.name.length <= 24, r.name);
      assert.ok(r.max > 0 && r.windowSec > 0);
      assert.ok(`${r.name}:${'0'.repeat(32)}`.length <= 80);
    }
  });
  it('login: 5 intentos por correo+IP cada 15 min, y las reglas sensibles fallan cerrado', () => {
    assert.deepEqual([RULES.login_pair.max, RULES.login_pair.windowSec], [5, 900]);
    for (const r of [RULES.login_pair, RULES.login_ip, RULES.login_id, RULES.pwd_user, RULES.staff_redeem, RULES.redeem_pulse, RULES.claim_ip, RULES.att_photo]) {
      assert.equal(r.onFail, 'closed', r.name);
    }
  });
});
