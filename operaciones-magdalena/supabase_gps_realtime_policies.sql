-- Fase Deploy Vercel + Realtime GPS
-- Ejecutar manualmente en Supabase SQL Editor

ALTER TABLE ubicaciones_repartidor ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_ubicaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "repartidor_gestiona_ubicacion"
ON ubicaciones_repartidor
FOR ALL
TO authenticated
USING (auth.uid() = repartidor_id)
WITH CHECK (auth.uid() = repartidor_id);

CREATE POLICY "admin_lee_todas_ubicaciones"
ON ubicaciones_repartidor
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND rol = 'admin'
  )
);

CREATE POLICY "repartidor_inserta_historial_ubi"
ON historial_ubicaciones
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = repartidor_id);

CREATE POLICY "admin_lee_historial_ubicaciones"
ON historial_ubicaciones
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND rol = 'admin'
  )
);

ALTER PUBLICATION supabase_realtime ADD TABLE ubicaciones_repartidor;
