import React, { useEffect, useState } from 'react';

export default function Alerta({ tipo = 'info', mensaje, accionTexto, onAccion, durationMs = 4000, onClose }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (mensaje) {
      setProgress(100);
      const raf = requestAnimationFrame(() => setProgress(0));
      const timer = setTimeout(() => {
        onClose();
      }, durationMs);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
  }, [mensaje, durationMs, onClose]);

  if (!mensaje) return null;

  const colores = {
    success: {
      box: 'bg-green-50 border-green-200 text-green-900',
      progress: 'bg-green-500',
      action: 'text-green-700 hover:text-green-900',
    },
    error: {
      box: 'bg-red-50 border-red-200 text-red-900',
      progress: 'bg-red-500',
      action: 'text-red-700 hover:text-red-900',
    },
    warning: {
      box: 'bg-amber-50 border-amber-200 text-amber-900',
      progress: 'bg-amber-500',
      action: 'text-amber-700 hover:text-amber-900',
    },
    info: {
      box: 'bg-blue-50 border-blue-200 text-blue-900',
      progress: 'bg-blue-500',
      action: 'text-blue-700 hover:text-blue-900',
    },
  };

  const colorClass = colores[tipo] || colores.info;

  const handleAction = () => {
    if (typeof onAccion === 'function') onAccion();
    onClose();
  };

  return (
    <div className="fixed top-4 right-4 z-[140] w-full max-w-sm px-3 sm:px-0 animate-fade-in-down pointer-events-none">
      <div className={`pointer-events-auto rounded-2xl shadow-xl border overflow-hidden ${colorClass.box}`}>
        <div className="p-3.5 flex items-start gap-3">
          <div className="flex-1 font-body text-sm leading-relaxed">{mensaje}</div>
          <div className="flex items-center gap-2">
            {accionTexto && (
              <button onClick={handleAction} className={`text-xs font-black uppercase tracking-wider ${colorClass.action}`}>
                {accionTexto}
              </button>
            )}
            <button onClick={onClose} className="opacity-60 hover:opacity-100 font-bold text-lg leading-none">&times;</button>
          </div>
        </div>
        <div className="h-1 bg-black/5">
          <div className={`h-full ${colorClass.progress}`} style={{ width: `${progress}%`, transition: `width ${durationMs}ms linear` }} />
        </div>
      </div>
    </div>
  );
}
