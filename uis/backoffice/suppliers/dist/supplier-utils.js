(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.NexovaSupplierUtils = exports.categories = void 0;
    exports.labelFor = labelFor;
    exports.escapeHtml = escapeHtml;
    exports.currencyLabel = currencyLabel;
    exports.isRenewalSoon = isRenewalSoon;
    exports.categories = [
        ['job_boards', 'Plataformas de empleo'], ['ats_software', 'Software ATS'],
        ['assessment_tools', 'Herramientas de evaluación'], ['training_platforms', 'Plataformas de formación'],
        ['payroll_and_hr_software', 'Nómina y RR. HH.'], ['video_interview', 'Entrevista por video'],
        ['background_check', 'Verificación de antecedentes'], ['office_and_facilities', 'Oficina e instalaciones'],
        ['it_and_software_licenses', 'Licencias de software e IT'],
    ];
    function labelFor(value) {
        var _a;
        return ((_a = exports.categories.find(([key]) => key === value)) === null || _a === void 0 ? void 0 : _a[1]) || value;
    }
    function escapeHtml(value) {
        return String(value !== null && value !== void 0 ? value : '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }
    function currencyLabel(supplier) {
        if (!supplier || !Number.isFinite(supplier.monthly_rate)) {
            throw new TypeError('A supplier with a valid currency and monthly rate is required');
        }
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: supplier.currency }).format(supplier.monthly_rate);
    }
    function isRenewalSoon(dateValue, now = new Date()) {
        if (!dateValue)
            return false;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue))
            return false;
        const renewal = new Date(`${dateValue}T00:00:00`);
        if (Number.isNaN(renewal.getTime()) || renewal.toISOString().slice(0, 10) !== dateValue)
            return false;
        const today = new Date(now);
        if (Number.isNaN(today.getTime()))
            throw new TypeError('now must be a valid date');
        today.setHours(0, 0, 0, 0);
        const days = (renewal.getTime() - today.getTime()) / 86400000;
        return days >= 0 && days <= 60;
    }
    exports.NexovaSupplierUtils = { categories: exports.categories, labelFor, escapeHtml, currencyLabel, isRenewalSoon };
    if (typeof window !== 'undefined') {
        window.NexovaSupplierUtils = exports.NexovaSupplierUtils;
    }
});
