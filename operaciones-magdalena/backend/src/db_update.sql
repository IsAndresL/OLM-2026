-- 1. Añadir campos 'identificacion' a usuarios (para Repartidor)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS identificacion VARCHAR(50);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS current_session_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_usuarios_last_activity_at ON usuarios(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_usuarios_current_session_id ON usuarios(current_session_id);

-- 2. Permisos granulares para administradores
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_principal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permisos JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Bootstrap de administrador principal (si existe el correo base)
UPDATE usuarios
SET es_principal = TRUE
WHERE email = 'andresfluna03@gmail.com';
 
-- 4. Fallback: si no hay principal, marcar al admin mas antiguo
WITH admin_mas_antiguo AS (
	SELECT id
	FROM usuarios
	WHERE rol = 'admin'
	ORDER BY created_at ASC
	LIMIT 1
)
UPDATE usuarios u
SET es_principal = TRUE
FROM admin_mas_antiguo a
WHERE u.id = a.id
	AND NOT EXISTS (SELECT 1 FROM usuarios WHERE rol = 'admin' AND es_principal = TRUE);

-- Si no existe la columna en empresas, revisar. El schema actual tiene 'nit' pero no está mapeado en la creación combinada.
-- Para que el Admin pueda crear una empresa desde la interfaz de 'Usuarios', necesitamos que el endpoint de usuarios también cree la Empresa asociada en la base de datos si el rol es 'empresa'.

-- 5. Fase 5: tarifas, COD, liquidaciones y cortes de caja

CREATE TABLE IF NOT EXISTS tarifas_repartidor (
	id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	repartidor_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
	tarifa_base    DECIMAL(10,2) NOT NULL DEFAULT 3500,
	tarifa_novedad DECIMAL(10,2) NOT NULL DEFAULT 500,
	activa         BOOLEAN NOT NULL DEFAULT TRUE,
	created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tarifa_rep_activa
	ON tarifas_repartidor(repartidor_id)
	WHERE activa = TRUE;

CREATE TABLE IF NOT EXISTS tarifas_empresa (
	id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
	tarifa_base   DECIMAL(10,2) NOT NULL DEFAULT 5000,
	tarifa_cod    DECIMAL(10,2) NOT NULL DEFAULT 500,
	activa        BOOLEAN NOT NULL DEFAULT TRUE,
	created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tarifa_emp_activa
	ON tarifas_empresa(empresa_id)
	WHERE activa = TRUE;

ALTER TABLE guias ADD COLUMN IF NOT EXISTS es_cod      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE guias ADD COLUMN IF NOT EXISTS monto_cod   DECIMAL(10,2);
ALTER TABLE guias ADD COLUMN IF NOT EXISTS cod_cobrado DECIMAL(10,2);

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_name = 'guias' AND column_name = 'cod_metodo'
	) THEN
		ALTER TABLE guias
			ADD COLUMN cod_metodo VARCHAR(20)
			CHECK (cod_metodo IN ('efectivo','transferencia','nequi','daviplata'));
	END IF;
END $$;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_name = 'guias' AND column_name = 'cod_estado'
	) THEN
		ALTER TABLE guias
			ADD COLUMN cod_estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
			CHECK (cod_estado IN ('pendiente','cobrado','no_cobrado','entregado_sede'));
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS liquidaciones_repartidor (
	id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	repartidor_id      UUID NOT NULL REFERENCES usuarios(id),
	fecha_desde        DATE NOT NULL,
	fecha_hasta        DATE NOT NULL,
	total_entregadas   INT NOT NULL DEFAULT 0,
	total_novedades    INT NOT NULL DEFAULT 0,
	tarifa_base        DECIMAL(10,2) NOT NULL,
	tarifa_novedad     DECIMAL(10,2) NOT NULL DEFAULT 0,
	subtotal_guias     DECIMAL(12,2) NOT NULL,
	subtotal_novedades DECIMAL(12,2) NOT NULL DEFAULT 0,
	total_cod_recaudado DECIMAL(12,2) NOT NULL DEFAULT 0,
	total_cod_entregado DECIMAL(12,2) NOT NULL DEFAULT 0,
	deduccion_cod      DECIMAL(12,2) NOT NULL DEFAULT 0,
	total_a_pagar      DECIMAL(12,2) NOT NULL,
	estado             VARCHAR(20) NOT NULL DEFAULT 'borrador'
		CHECK (estado IN ('borrador','aprobada','pagada')),
	observaciones      TEXT,
	creado_por         UUID REFERENCES usuarios(id),
	created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_liq_repartidor
	ON liquidaciones_repartidor(repartidor_id);

CREATE TABLE IF NOT EXISTS liquidacion_guias (
	liquidacion_id UUID REFERENCES liquidaciones_repartidor(id) ON DELETE CASCADE,
	guia_id        UUID REFERENCES guias(id),
	tipo           VARCHAR(20) CHECK (tipo IN ('entregada','novedad')),
	monto          DECIMAL(10,2) NOT NULL,
	PRIMARY KEY (liquidacion_id, guia_id)
);

CREATE TABLE IF NOT EXISTS cortes_caja (
	id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	repartidor_id   UUID NOT NULL REFERENCES usuarios(id),
	monto_declarado DECIMAL(12,2) NOT NULL,
	monto_recibido  DECIMAL(12,2),
	diferencia      DECIMAL(12,2)
		GENERATED ALWAYS AS (monto_recibido - monto_declarado) STORED,
	estado          VARCHAR(20) NOT NULL DEFAULT 'pendiente'
		CHECK (estado IN ('pendiente','verificado','discrepancia')),
	guias_cod       JSONB,
	observaciones   TEXT,
	admin_id        UUID REFERENCES usuarios(id),
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corte_repartidor
	ON cortes_caja(repartidor_id);

-- 6. Fase 6: GPS, rutas optimizadas, zonas, firma digital y devoluciones

CREATE TABLE IF NOT EXISTS ubicaciones_repartidor (
	repartidor_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
	lat          DECIMAL(10, 7) NOT NULL,
	lng          DECIMAL(10, 7) NOT NULL,
	precision_m  INT,
	activo       BOOLEAN NOT NULL DEFAULT TRUE,
	updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS historial_ubicaciones (
	id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	repartidor_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
	lat           DECIMAL(10, 7) NOT NULL,
	lng           DECIMAL(10, 7) NOT NULL,
	created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hist_ubi_rep
	ON historial_ubicaciones(repartidor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS zonas (
	id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	nombre      VARCHAR(100) NOT NULL,
	descripcion TEXT,
	color       VARCHAR(7) NOT NULL DEFAULT '#1D4ED8',
	activa      BOOLEAN NOT NULL DEFAULT TRUE,
	created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zonas_barrios (
	id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	zona_id    UUID NOT NULL REFERENCES zonas(id) ON DELETE CASCADE,
	barrio     VARCHAR(100) NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (zona_id, barrio)
);

CREATE TABLE IF NOT EXISTS zonas_repartidores (
	zona_id       UUID NOT NULL REFERENCES zonas(id) ON DELETE CASCADE,
	repartidor_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
	PRIMARY KEY (zona_id, repartidor_id)
);

ALTER TABLE guias ADD COLUMN IF NOT EXISTS zona_id UUID REFERENCES zonas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_guias_zona ON guias(zona_id);

ALTER TABLE guias ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 7);
ALTER TABLE guias ADD COLUMN IF NOT EXISTS lng DECIMAL(10, 7);

CREATE TABLE IF NOT EXISTS rutas_dia (
	id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	repartidor_id UUID NOT NULL REFERENCES usuarios(id),
	fecha         DATE NOT NULL,
	orden_guias   JSONB NOT NULL,
	distancia_km  DECIMAL(8, 2),
	tiempo_min    INT,
	estado        VARCHAR(20) NOT NULL DEFAULT 'pendiente'
		CHECK (estado IN ('pendiente','en_progreso','completada')),
	created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (repartidor_id, fecha)
);

ALTER TABLE historial_estados
	ADD COLUMN IF NOT EXISTS firma_url TEXT,
	ADD COLUMN IF NOT EXISTS nombre_receptor VARCHAR(255),
	ADD COLUMN IF NOT EXISTS cedula_receptor VARCHAR(20);

CREATE TABLE IF NOT EXISTS devoluciones (
	id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	guia_id          UUID NOT NULL REFERENCES guias(id),
	guia_retorno_id  UUID REFERENCES guias(id),
	motivo           VARCHAR(50) NOT NULL
		CHECK (motivo IN (
			'no_contesto','direccion_incorrecta','rechazo_cliente',
			'paquete_danado','direccion_no_existe','otro'
		)),
	descripcion      TEXT,
	estado           VARCHAR(30) NOT NULL DEFAULT 'en_bodega'
		CHECK (estado IN ('en_bodega','en_retorno','devuelto_remitente','descartado')),
	repartidor_id    UUID REFERENCES usuarios(id),
	admin_id         UUID REFERENCES usuarios(id),
	foto_paquete_url TEXT,
	created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_guia ON devoluciones(guia_id);

INSERT INTO zonas (id, nombre, descripcion, color)
SELECT uuid_generate_v4(), 'Norte', 'Taganga, Bello Horizonte, El Rodadero Norte', '#1D4ED8'
WHERE NOT EXISTS (SELECT 1 FROM zonas WHERE LOWER(nombre) = 'norte');

INSERT INTO zonas (id, nombre, descripcion, color)
SELECT uuid_generate_v4(), 'Centro', 'Centro historico, El Prado, Los Almendros', '#059669'
WHERE NOT EXISTS (SELECT 1 FROM zonas WHERE LOWER(nombre) = 'centro');

INSERT INTO zonas (id, nombre, descripcion, color)
SELECT uuid_generate_v4(), 'Sur', 'Bastidas, La Paz, Villa del Rio, Los Alpes', '#D97706'
WHERE NOT EXISTS (SELECT 1 FROM zonas WHERE LOWER(nombre) = 'sur');

INSERT INTO zonas (id, nombre, descripcion, color)
SELECT uuid_generate_v4(), 'Rodadero', 'Rodadero, Gaira, Pozos Colorados', '#DC2626'
WHERE NOT EXISTS (SELECT 1 FROM zonas WHERE LOWER(nombre) = 'rodadero');

INSERT INTO zonas (id, nombre, descripcion, color)
SELECT uuid_generate_v4(), 'Mamatoco', 'Mamatoco, Cristo Rey, Villa Universitaria', '#7C3AED'
WHERE NOT EXISTS (SELECT 1 FROM zonas WHERE LOWER(nombre) = 'mamatoco');
