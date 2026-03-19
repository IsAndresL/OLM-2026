import React, { useEffect } from 'react';

export default function Alerta({ tipo = 'info', mensaje, onClose }) {
  useEffect(() => {
    if (mensaje) {
      const timer = setTimeout(() => {
        onClose();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [mensaje, onClose]);

  if (!mensaje) return null;

  const colores = {
    success: 'bg-green-100 border-green-500 text-green-800',
    error: 'bg-red-100 border-red-500 text-red-800',
    warning: 'bg-yellow-100 border-yellow-500 text-yellow-800',
    info: 'bg-blue-100 border-blue-500 text-blue-800',
  };

  const colorClass = colores[tipo] || colores.info;

  return (
    <div className={`fixed top-4 right-4 z-50 animate-fade-in-down`}>
      <div className={`border-l-4 p-4 rounded shadow-lg max-w-sm flex items-center gap-3 ${colorClass}`}>
        <div className="flex-1 font-body text-sm">{mensaje}</div>
        <button onClick={onClose} className="opacity-50 hover:opacity-100 font-bold">&times;</button>
      </div>
    </div>
  );
}
