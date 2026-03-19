export const ADMIN_PERMISSION_KEYS = [
  'dashboard.view',
  'guias.view',
  'guias.create',
  'guias.edit',
  'guias.assign',
  'guias.delete',
  'reportes.export',
  'etiquetas.generar',
  'usuarios.view',
  'usuarios.create',
  'usuarios.edit',
  'usuarios.delete',
  'usuarios.permissions.manage',
  'liquidaciones.view',
  'liquidaciones.manage',
  'caja_cod.view',
  'caja_cod.manage',
  'tarifas.manage',
  'mapa.view',
  'rutas.manage',
  'zonas.manage',
  'devoluciones.view',
  'devoluciones.manage',
];

export const ADMIN_PERMISSION_LABELS = {
  'dashboard.view': 'Ver dashboard ejecutivo',
  'guias.view': 'Ver modulo de guias',
  'guias.create': 'Crear guias',
  'guias.edit': 'Editar guias',
  'guias.assign': 'Asignar guias a repartidores',
  'guias.delete': 'Eliminar guias',
  'reportes.export': 'Exportar reportes',
  'etiquetas.generar': 'Generar etiquetas',
  'usuarios.view': 'Ver usuarios',
  'usuarios.create': 'Crear usuarios',
  'usuarios.edit': 'Editar usuarios',
  'usuarios.delete': 'Eliminar usuarios',
  'usuarios.permissions.manage': 'Gestionar permisos de otros admins',
  'liquidaciones.view': 'Ver modulo de liquidaciones',
  'liquidaciones.manage': 'Crear y actualizar liquidaciones',
  'caja_cod.view': 'Ver cortes de caja contraentrega',
  'caja_cod.manage': 'Verificar cortes de caja contraentrega',
  'tarifas.manage': 'Gestionar tarifas de repartidores y empresas',
  'mapa.view': 'Ver mapa en vivo de repartidores',
  'rutas.manage': 'Optimizar y editar rutas',
  'zonas.manage': 'Gestionar zonas y asignaciones',
  'devoluciones.view': 'Ver devoluciones',
  'devoluciones.manage': 'Registrar y actualizar devoluciones',
};

export const DEFAULT_ADMIN_PERMISSIONS = {
  'dashboard.view': true,
  'guias.view': true,
};

export function normalizeAdminPermissions(raw = {}, isPrincipal = false) {
  const base = {};
  for (const key of ADMIN_PERMISSION_KEYS) {
    base[key] = Boolean(raw[key]);
  }
  if (isPrincipal) {
    for (const key of ADMIN_PERMISSION_KEYS) {
      base[key] = true;
    }
  }
  return base;
}
