export function h(tag, props = {}, ...children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false)
            continue;
        if (key === 'className')
            element.className = String(value);
        else if (key === 'dataset')
            Object.assign(element.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.slice(2).toLowerCase(), value);
        }
        else if (value === true)
            element.setAttribute(key, '');
        else
            element.setAttribute(key, String(value));
    }
    append(element, ...children);
    return element;
}
export function append(parent, ...children) {
    for (const child of children) {
        if (child === null || child === undefined || child === false)
            continue;
        parent.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
    }
}
export function formatDateTime(iso) {
    // The API returns naive UTC timestamps for some drivers; treat a missing offset as UTC.
    const value = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return iso;
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
/** Shared design-system classes (Tailwind CDN, matching uis/backoffice/index.html). */
export const UI = {
    card: 'rounded-xl border border-slate-200 bg-white shadow-sm',
    input: 'mt-1 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 aria-[invalid=true]:border-rose-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400',
    label: 'block text-sm font-medium',
    primary: 'min-h-11 rounded-md bg-sky-700 px-5 font-semibold text-white hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
    secondary: 'inline-flex items-center rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100',
    fieldError: 'mt-1 text-sm font-medium text-rose-700',
    success: 'rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800',
    error: 'rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800',
    warning: 'mt-1 text-sm font-medium text-amber-800',
};
