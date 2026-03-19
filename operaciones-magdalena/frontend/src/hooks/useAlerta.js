import { useState, useCallback } from 'react';

export default function useAlerta() {
  const [alertaParams, setAlertaParams] = useState({ tipo: 'info', mensaje: '' });

  const mostrarAlerta = useCallback((tipo, mensaje) => {
    setAlertaParams({ tipo, mensaje });
  }, []);

  const cerrarAlerta = useCallback(() => {
    setAlertaParams({ tipo: 'info', mensaje: '' });
  }, []);

  return {
    alerta: alertaParams,
    mostrarAlerta,
    cerrarAlerta
  };
}
