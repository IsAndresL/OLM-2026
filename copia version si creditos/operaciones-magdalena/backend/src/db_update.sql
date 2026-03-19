-- 1. Añadir campos 'identificacion' a usuarios (para Repartidor)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS identificacion VARCHAR(50);

-- Si no existe la columna en empresas, revisar. El schema actual tiene 'nit' pero no está mapeado en la creación combinada.
-- Para que el Admin pueda crear una empresa desde la interfaz de 'Usuarios', necesitamos que el endpoint de usuarios también cree la Empresa asociada en la base de datos si el rol es 'empresa'.
