const estadoConfig = {
  registrado:           { label: 'Registrado',           color: 'bg-gray-100 text-gray-700' },
  asignado:             { label: 'Asignado',             color: 'bg-blue-100 text-blue-700' },
  en_ruta:              { label: 'En ruta',              color: 'bg-amber-100 text-amber-700' },
  entregado:            { label: 'Entregado',            color: 'bg-green-100 text-green-700' },
  no_contesto:          { label: 'No contestó',          color: 'bg-orange-100 text-orange-700' },
  direccion_incorrecta: { label: 'Dir. incorrecta',      color: 'bg-red-100 text-red-700' },
  reagendar:            { label: 'Reagendar',            color: 'bg-purple-100 text-purple-700' },
  devuelto:             { label: 'Devuelto',             color: 'bg-red-200 text-red-800' },
};

export default function BadgeEstado({ estado }) {
  const cfg = estadoConfig[estado] || { label: estado, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}
