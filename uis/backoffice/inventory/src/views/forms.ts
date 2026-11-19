import { h, UI } from '../dom.js';
import type { Asset } from '../lib/inventory.js';

export interface Field<T extends HTMLElement> { wrapper: HTMLElement; control: T; error: HTMLElement }

/** Label + control + inline error, wired with aria-describedby for screen readers. */
export function field<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(id: string, label: string, control: T, hint?: HTMLElement | null, required = true): Field<T> {
  const error = h('p', { id: `${id}-error`, className: UI.fieldError, dataset: { fieldError: id } });
  control.id = id;
  control.setAttribute('aria-describedby', [hint?.id, error.id].filter(Boolean).join(' '));
  const marker = required ? h('span', { 'aria-hidden': 'true' }, '*') : h('span', { className: 'font-normal text-slate-500' }, '(opcional)');
  const wrapper = h('div', {}, h('label', { for: id, className: UI.label }, label, ' ', marker), control, hint ?? null, error);
  return { wrapper, control, error };
}

export function setFieldError(f: Field<HTMLElement>, message: string): void {
  f.error.textContent = message;
  if (message) f.control.setAttribute('aria-invalid', 'true'); else f.control.removeAttribute('aria-invalid');
}

/** Product selector shows names (with SKU and office), never raw ids. */
export function fillProductSelect(select: HTMLSelectElement, assets: Asset[], selectedId: string): void {
  select.replaceChildren(
    h('option', { value: '' }, assets.length ? 'Selecciona un activo' : 'No hay activos disponibles'),
    ...assets.map(asset => h('option', { value: String(asset.id) }, `${asset.name} · ${asset.sku} · ${asset.office}`)));
  select.value = assets.some(asset => String(asset.id) === selectedId) ? selectedId : '';
}

/** Parses a positive whole-number quantity; returns an error message or the value. */
export function parseQuantity(raw: string): { value?: number; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: 'Introduce una cantidad.' };
  if (!/^\d+$/.test(trimmed)) return { error: 'La cantidad debe ser un número entero de unidades.' };
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < 1) return { error: 'La cantidad debe ser al menos 1 unidad.' };
  return { value };
}

export function banner(kind: 'success' | 'error', message: string): HTMLElement {
  return h('div', { role: kind === 'error' ? 'alert' : 'status', className: kind === 'error' ? UI.error : UI.success, dataset: { state: kind } }, message);
}
