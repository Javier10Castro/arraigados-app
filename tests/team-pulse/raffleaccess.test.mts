import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canManageRaffles, publicWinnerName } from '../../server/raffles';

/** Rifas: solo las dos cuentas autorizadas pueden operarlas (la autorización real está en el servidor). Sin base de datos. */
describe('autorización de Rifas · sin base de datos', () => {
  it('solo las dos cuentas autorizadas (sin importar mayúsculas ni espacios)', () => {
    assert.equal(canManageRaffles('javiercastro9912@gmail.com'), true);
    assert.equal(canManageRaffles(' PerlaRivera@RedJuvenilTijuana.com '), true);
    assert.equal(canManageRaffles('otro@admin.com'), false);
    assert.equal(canManageRaffles(null), false);
    assert.equal(canManageRaffles(undefined), false);
  });
});

describe('nombre público del ganador · sin base de datos', () => {
  it('nombre + inicial del primer apellido; nunca apellidos completos', () => {
    assert.equal(publicWinnerName('Ana Asistente López'), 'Ana A.');
    assert.equal(publicWinnerName('  josé   de la Cruz Pérez '), 'josé C.');
    assert.equal(publicWinnerName('Álvaro Ñúñez'), 'Álvaro Ñ.');
    assert.equal(publicWinnerName('Madonna'), 'Madonna');
    assert.equal(publicWinnerName(''), '');
    for (const n of ['Ana Asistente López', 'Luis Pérez']) assert.ok(!publicWinnerName(n).includes(n.split(' ')[1]) || n.split(' ')[1].length === 1);
  });
});
