-- Operaciones Logísticas del Magdalena
-- Ejecutar en Supabase → SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. EMPRESAS
CREATE TABLE empresas (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre     VARCHAR(255) NOT NULL,
  nit        VARCHAR(20)  UNIQUE,
  email      VARCHAR(255),
  telefono   VARCHAR(20),
  logo_url   TEXT,
  activa     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO empresas (id, nombre, nit, email)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Operaciones Logísticas del Magdalena',
  '900000001-1',
  'ops@magdalenalogistica.com'
);

-- 2. USUARIOS (profiles — id = auth.users.id)
CREATE TABLE usuarios (
  id               UUID PRIMARY KEY,
  nombre_completo  VARCHAR(255) NOT NULL,
  email            VARCHAR(255) NOT NULL UNIQUE,
  telefono         VARCHAR(20),
  rol              VARCHAR(20) NOT NULL CHECK (rol IN ('admin','empresa','repartidor')),
  empresa_id       UUID REFERENCES empresas(id) ON DELETE SET NULL,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_usuarios_rol        ON usuarios(rol);
CREATE INDEX idx_usuarios_empresa_id ON usuarios(empresa_id);

-- 3. GUÍAS
CREATE TABLE guias (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero_guia            VARCHAR(30) NOT NULL UNIQUE,
  empresa_id             UUID NOT NULL REFERENCES empresas(id),
  repartidor_id          UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  estado_actual          VARCHAR(30) NOT NULL DEFAULT 'registrado'
                           CHECK (estado_actual IN (
                             'registrado','asignado','en_ruta',
                             'entregado','no_contesto',
                             'direccion_incorrecta','reagendar','devuelto'
                           )),
  nombre_remitente       VARCHAR(255) NOT NULL,
  nombre_destinatario    VARCHAR(255) NOT NULL,
  telefono_destinatario  VARCHAR(20)  NOT NULL,
  direccion_destinatario TEXT         NOT NULL,
  ciudad_destino         VARCHAR(100) NOT NULL,
  barrio                 VARCHAR(100),
  descripcion_paquete    TEXT,
  peso_kg                DECIMAL(6,2),
  valor_declarado        DECIMAL(12,2),
  observaciones          TEXT,
  fecha_estimada_entrega DATE,
  etiqueta_pdf_url       TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_guias_empresa_id    ON guias(empresa_id);
CREATE INDEX idx_guias_repartidor_id ON guias(repartidor_id);
CREATE INDEX idx_guias_estado_actual ON guias(estado_actual);
CREATE INDEX idx_guias_created_at    ON guias(created_at DESC);
CREATE INDEX idx_guias_numero        ON guias(numero_guia);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guias_updated_at
  BEFORE UPDATE ON guias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. HISTORIAL_ESTADOS
CREATE TABLE historial_estados (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guia_id            UUID NOT NULL REFERENCES guias(id) ON DELETE CASCADE,
  estado             VARCHAR(30) NOT NULL,
  nota               TEXT,
  usuario_id         UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  foto_evidencia_url TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_historial_guia_id    ON historial_estados(guia_id);
CREATE INDEX idx_historial_created_at ON historial_estados(created_at DESC);

-- 5. NOTIFICACIONES
CREATE TABLE notificaciones (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guia_id          UUID NOT NULL REFERENCES guias(id) ON DELETE CASCADE,
  tipo             VARCHAR(20) NOT NULL CHECK (tipo IN ('whatsapp','sms','email')),
  destinatario_tel VARCHAR(20),
  mensaje          TEXT NOT NULL,
  estado_envio     VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                     CHECK (estado_envio IN ('pendiente','enviado','fallido')),
  enviado_at       TIMESTAMPTZ
);
CREATE INDEX idx_notif_guia_id ON notificaciones(guia_id);

-- 6. FUNCIÓN: número de guía automático (MAG-YYYYMMDD-XXXX)
CREATE OR REPLACE FUNCTION generar_numero_guia()
RETURNS VARCHAR AS $$
DECLARE
  fecha_str VARCHAR(8);
  secuencia INT;
BEGIN
  fecha_str := TO_CHAR(NOW(), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO secuencia
  FROM guias WHERE numero_guia LIKE 'MAG-' || fecha_str || '-%';
  RETURN 'MAG-' || fecha_str || '-' || LPAD(secuencia::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 7. ROW LEVEL SECURITY — solo el backend (service_role) accede
ALTER TABLE empresas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE guias             ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backend_only" ON empresas          USING (auth.role() = 'service_role');
CREATE POLICY "backend_only" ON usuarios          USING (auth.role() = 'service_role');
CREATE POLICY "backend_only" ON guias             USING (auth.role() = 'service_role');
CREATE POLICY "backend_only" ON historial_estados USING (auth.role() = 'service_role');
CREATE POLICY "backend_only" ON notificaciones    USING (auth.role() = 'service_role');

-- 8. CREAR USUARIO ADMIN (instrucciones):
-- 1) Ve a Supabase → Authentication → Users → Add user
-- 2) Email: admin@magdalenalogistica.com  |  Password: (elige uno seguro)
-- 3) Copia el UUID generado y ejecuta:
-- INSERT INTO usuarios (id, nombre_completo, email, rol, empresa_id)
-- VALUES ('PEGA-UUID-AQUI','Administrador Principal',
--         'admin@magdalenalogistica.com','admin',
--         '00000000-0000-0000-0000-000000000001');
