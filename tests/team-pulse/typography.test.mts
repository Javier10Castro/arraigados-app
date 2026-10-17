import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { pressioText } from '../../src/lib/pressio';

/** Tipografía: los títulos en Pressio van sin tildes; el texto normal conserva sus acentos. */
describe('títulos en Pressio · sin acentos', () => {
  it('quita tildes y diéresis: Información, Más, Administración', () => {
    assert.equal(pressioText('Información'), 'Informacion');
    assert.equal(pressioText('Más'), 'Mas');
    assert.equal(pressioText('Administración'), 'Administracion');
    assert.equal(pressioText('Configuración'), 'Configuracion');
    assert.equal(pressioText('Pingüino ÁÉÍÓÚ'), 'Pinguino AEIOU');
  });
  it('conserva la ñ (cambiarla cambia la palabra) y lo que no lleva acento', () => {
    assert.equal(pressioText('Año Niño'), 'Año Niño');
    assert.equal(pressioText('Kit - A 2K26'), 'Kit - A 2K26');
    assert.equal(pressioText(''), '');
  });
  it('no es global: solo AdminShell y el aviso del Dashboard usan pressioText; ScreenHeader, Más y párrafos no', () => {
    const uses = (f: string) => fs.readFileSync(f, 'utf8').includes('pressioText');
    assert.ok(uses('src/admin/AdminShell.tsx'));
    assert.ok(uses('src/admin/dashboard/Dashboard.tsx'));
    for (const f of ['src/components/ScreenHeader.tsx', 'src/pages/Mas.tsx', 'src/pages/Perfil.tsx', 'src/pages/Beneficios.tsx', 'src/components/AppShell.tsx', 'src/pages/Rifa.tsx']) {
      assert.ok(!uses(f), `${f} no debe quitar acentos`);
    }
    // El texto normal conserva sus acentos en el código fuente.
    assert.match(fs.readFileSync('src/pages/Mas.tsx', 'utf8'), /title="Más"/);
    assert.match(fs.readFileSync('src/admin/Configuracion.tsx', 'utf8'), /title="Configuración"/); // el dato no cambia; solo lo que se pinta en Pressio
  });
});
