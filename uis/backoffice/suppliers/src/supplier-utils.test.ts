import { currencyLabel, escapeHtml, isRenewalSoon, labelFor } from './supplier-utils';

describe('supplier frontend utilities', () => {
  test('labelFor resolves the actual directory category and falls back for unknown values', () => {
    expect(labelFor('ats_software')).toBe('Software ATS');
    expect(labelFor('future_category')).toBe('future_category');
    expect(labelFor('')).toBe('');
  });

  test('escapeHtml escapes markup and tolerates nullish or arbitrary input', () => {
    expect(escapeHtml(`<tag a="'">&`)).toBe('&lt;tag a=&quot;&#39;&quot;&gt;&amp;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml({ value: 1 })).toBe('[object Object]');
  });

  test('currencyLabel formats a supported rate and rejects malformed arguments/currency', () => {
    expect(currencyLabel({ currency: 'EUR', monthly_rate: 1234.5 })).toContain('1234,50');
    expect(() => currencyLabel({ currency: 'EUR', monthly_rate: Number.NaN })).toThrow(TypeError);
    expect(() => currencyLabel({ currency: 'INVALID' as 'EUR', monthly_rate: 2 })).toThrow(RangeError);
    expect(() => currencyLabel(null as never)).toThrow(TypeError);
  });

  test('isRenewalSoon handles inclusive day boundaries, past dates, and malformed input', () => {
    const today = new Date('2026-11-13T18:00:00');
    expect(isRenewalSoon('2026-11-13', today)).toBe(true);
    expect(isRenewalSoon('2027-01-12', today)).toBe(true);
    expect(isRenewalSoon('2027-01-13', today)).toBe(false);
    expect(isRenewalSoon('2026-11-12', today)).toBe(false);
    expect(isRenewalSoon('2026-02-30', today)).toBe(false);
    expect(isRenewalSoon('not-a-date', today)).toBe(false);
    expect(isRenewalSoon(undefined, today)).toBe(false);
    expect(() => isRenewalSoon('2026-11-14', new Date(Number.NaN))).toThrow(TypeError);
  });
});
