export type SupplierCurrency = 'EUR' | 'USD' | 'CLP' | 'ARS';

export interface SupplierPrice {
  currency: SupplierCurrency;
  monthly_rate: number;
}

export const categories: ReadonlyArray<readonly [string, string]> = [
  ['job_boards', 'Plataformas de empleo'], ['ats_software', 'Software ATS'],
  ['assessment_tools', 'Herramientas de evaluación'], ['training_platforms', 'Plataformas de formación'],
  ['payroll_and_hr_software', 'Nómina y RR. HH.'], ['video_interview', 'Entrevista por video'],
  ['background_check', 'Verificación de antecedentes'], ['office_and_facilities', 'Oficina e instalaciones'],
  ['it_and_software_licenses', 'Licencias de software e IT'],
];

export function labelFor(value: string): string {
  return categories.find(([key]) => key === value)?.[1] || value;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));
}

export function currencyLabel(supplier: SupplierPrice): string {
  if (!supplier || !Number.isFinite(supplier.monthly_rate)) {
    throw new TypeError('A supplier with a valid currency and monthly rate is required');
  }
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: supplier.currency }).format(supplier.monthly_rate);
}

export function isRenewalSoon(dateValue: string | null | undefined, now: Date = new Date()): boolean {
  if (!dateValue) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return false;
  const renewal = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(renewal.getTime()) || renewal.toISOString().slice(0, 10) !== dateValue) return false;
  const today = new Date(now);
  if (Number.isNaN(today.getTime())) throw new TypeError('now must be a valid date');
  today.setHours(0, 0, 0, 0);
  const days = (renewal.getTime() - today.getTime()) / 86400000;
  return days >= 0 && days <= 60;
}

export const NexovaSupplierUtils = { categories, labelFor, escapeHtml, currencyLabel, isRenewalSoon };

declare global {
  interface Window {
    NexovaSupplierUtils: typeof NexovaSupplierUtils;
  }
}

if (typeof window !== 'undefined') {
  window.NexovaSupplierUtils = NexovaSupplierUtils;
}
