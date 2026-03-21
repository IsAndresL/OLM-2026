import { useState, useCallback } from 'react';

export default function useAlerta() {
  const [alertaParams, setAlertaParams] = useState({
    tipo: 'info',
    mensaje: '',
    accionTexto: '',
    onAccion: null,
    durationMs: 4000,
  });

  const mostrarAlerta = useCallback((tipo, mensaje, opciones = {}) => {
    setAlertaParams({
      tipo,
      mensaje,
      accionTexto: opciones.accionTexto || '',
      onAccion: typeof opciones.onAccion === 'function' ? opciones.onAccion : null,
      durationMs: Number.isFinite(opciones.durationMs) ? opciones.durationMs : 4000,
    });
  }, []);

  const cerrarAlerta = useCallback(() => {
    setAlertaParams({ tipo: 'info', mensaje: '', accionTexto: '', onAccion: null, durationMs: 4000 });
  }, []);

  return {
    alerta: alertaParams,
    mostrarAlerta,
    cerrarAlerta
  };
}
