-- Migracion Fase 6 (idempotente)
-- GPS en tiempo real + rutas optimizadas + zonas + firma digital + devoluciones

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
