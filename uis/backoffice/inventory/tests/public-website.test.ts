/**
 * AUTH02-06: the Hito 1 public website (uis/website) has no auth guard, token checks or redirects.
 * Static proof here; the E2E run additionally opens every page in Chrome with no token.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEBSITE = join(__dirname, '../../../website');
const files = readdirSync(WEBSITE).filter(name => /\.(html|js)$/.test(name));

describe('public website (Hito 1) is untouched by AUTH-02', () => {
  it('has its pages', () => {
    expect(files).toEqual(expect.arrayContaining(['index.html', 'application.html', 'validation.js']));
  });

  it.each(files)('%s contains no auth module, token storage, Authorization header or login redirect', file => {
    const source = readFileSync(join(WEBSITE, file), 'utf8');
    expect(source).not.toMatch(/NexovaAuth|auth-session|nexova\.auth\.token|localStorage|sessionStorage|Authorization|Bearer|\/login|\/backoffice/);
    expect(source).not.toMatch(/location\.(replace|assign|href\s*=)|http-equiv=["']refresh/i);
  });

  it('application.html still loads and validates with an empty storage (no redirect)', () => {
    window.localStorage.clear();
    const html = readFileSync(join(WEBSITE, 'application.html'), 'utf8');
    document.documentElement.innerHTML = new DOMParser().parseFromString(html, 'text/html').documentElement.innerHTML;
    const before = window.location.href;
    expect(() => new Function(readFileSync(join(WEBSITE, 'validation.js'), 'utf8'))()).not.toThrow();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(window.location.href).toBe(before);
    expect(document.querySelector('form')).not.toBeNull();
  });
});
