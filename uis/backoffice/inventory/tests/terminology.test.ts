/** Item 20: Nexova vocabulary from nexova-BRIEFING.es.md (activos, entradas, salidas, asignación, consumo). */
import { mountApp } from './helpers';

const PAGES: [string, string[]][] = [
  ['/backoffice/inventory/products', ['Activos en inventario', 'Stock actual', 'Registrar entrada', 'Registrar salida', 'Hardware', 'Periféricos', 'Material de oficina']],
  ['/backoffice/inventory/orders/inbound', ['Entrada de activos', 'Proveedor', 'Oficina receptora', 'Activo']],
  ['/backoffice/inventory/orders/outbound', ['Salida de activos', 'Asignación a empleado', 'Consumo', 'Empleado asignado', 'Stock disponible']],
  ['/backoffice/inventory/orders', ['Historial de órdenes', 'Entrada', 'Salida', 'Registrado por (UUID)']],
];

describe('company-specific terminology', () => {
  it.each(PAGES)('%s uses Nexova inventory vocabulary', async (path, terms) => {
    await mountApp(path);
    const text = document.getElementById('app')!.textContent!;
    for (const term of terms) expect(text).toContain(term);
    expect(text).not.toMatch(/\bProduct(o|os)?\b|\bInbound\b|\bOutbound\b/);
  });
});
