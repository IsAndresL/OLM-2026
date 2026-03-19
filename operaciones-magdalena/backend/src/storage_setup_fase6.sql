-- Setup de Storage para Fase 6
-- Ejecutar en Supabase SQL Editor

-- Bucket para evidencias fotograficas de entrega
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidencias', 'evidencias', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket para firmas digitales de receptor
INSERT INTO storage.buckets (id, name, public)
VALUES ('firmas', 'firmas', true)
ON CONFLICT (id) DO NOTHING;

-- Verificacion final
SELECT id, name, public
FROM storage.buckets
WHERE id IN ('evidencias', 'firmas')
ORDER BY id;
