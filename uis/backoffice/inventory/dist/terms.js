export const TERMS = {
    asset: 'Activo',
    assets: 'Activos',
    currentStock: 'Stock actual',
    availableStock: 'Stock disponible',
    inbound: 'Entrada de activos',
    outbound: 'Salida de activos',
    registerInbound: 'Registrar entrada',
    registerOutbound: 'Registrar salida',
    history: 'Historial de órdenes',
    supplier: 'Proveedor',
    office: 'Oficina',
    quantity: 'Cantidad',
    assignedTo: 'Empleado asignado',
    exitType: 'Tipo de salida',
    registeredBy: 'Registrado por (UUID)',
    createdAt: 'Fecha',
};
export const CATEGORY_LABELS = {
    hardware: 'Hardware',
    peripherals: 'Periféricos',
    office_supplies: 'Material de oficina',
    training_materials: 'Material de formación',
};
export const EXIT_TYPE_LABELS = {
    allocation: 'Asignación a empleado',
    consumption: 'Consumo',
};
export const ORDER_KIND_LABELS = {
    inbound: 'Entrada',
    outbound: 'Salida',
};
export function categoryLabel(category) {
    return CATEGORY_LABELS[category] ?? category;
}
