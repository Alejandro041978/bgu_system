-- Simulador de convalidación UPGRADE (16/09/2026).
-- Base: institutos tecnológicos peruanos (Censo 2025 + listado de licenciados
-- MINEDU al 23/06/2026). Reglas del usuario: solo institutos LICENCIADOS;
-- Bachelor en Contabilidad solo para egresados de Contabilidad; Bachelor en
-- Administración para Administración y carreras afines (bancaria, marketing,
-- RR.HH., logística, comercial, hotelería/turismo, publicidad, gestión
-- pública, gestión de producción, asistencia administrativa) y también para
-- Contabilidad; Secretariado y carreras no afines (salud, TI, ingeniería...) no.
-- La regla vive en el catálogo de carreras, editable por Registros.

CREATE TABLE IF NOT EXISTS upgrade_institutes (
  codigo_modular text PRIMARY KEY,
  nombre text NOT NULL,
  licenciado boolean NOT NULL DEFAULT false,
  fuente text,                       -- 'Censo 2025' | 'Solo listado licenciados'
  tipo text,
  gestion text,
  departamento text,
  provincia text,
  distrito text,
  n_programas int,
  matricula int,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_upgrade_institutes_nombre ON upgrade_institutes (nombre);
CREATE INDEX IF NOT EXISTS idx_upgrade_institutes_dep ON upgrade_institutes (departamento);

-- Catálogo NORMALIZADO de carreras: una fila por nombre normalizado (sin
-- tildes ni variantes de espacios). Aquí vive la regla.
CREATE TABLE IF NOT EXISTS upgrade_careers (
  carrera_key text PRIMARY KEY,
  nombre text NOT NULL,              -- forma canónica para mostrar
  familia text NOT NULL DEFAULT 'sin_clasificar'
    CHECK (familia IN ('contabilidad', 'administracion', 'afin', 'no_afin', 'sin_clasificar')),
  califica_admin boolean NOT NULL DEFAULT false,
  califica_conta boolean NOT NULL DEFAULT false,
  revisado boolean NOT NULL DEFAULT false,   -- false = clasificación automática pendiente de Registros
  nota text,
  n_programas int NOT NULL DEFAULT 0,        -- en cuántos institutos licenciados aparece
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS upgrade_institute_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_modular text NOT NULL REFERENCES upgrade_institutes(codigo_modular) ON DELETE CASCADE,
  carrera_key text NOT NULL REFERENCES upgrade_careers(carrera_key),
  carrera_raw text NOT NULL,
  tipo text,
  matricula int,
  UNIQUE (codigo_modular, carrera_key)
);
CREATE INDEX IF NOT EXISTS idx_upgrade_programs_inst ON upgrade_institute_programs (codigo_modular);

-- Interesados que usaron el simulador (público o interno) y dejaron contacto
CREATE TABLE IF NOT EXISTS upgrade_simulator_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  origen text NOT NULL DEFAULT 'publico',    -- 'publico' | 'erp'
  nombre text,
  whatsapp text,                              -- E.164
  email text,
  codigo_modular text,
  instituto_nombre text,
  carrera_key text,
  carrera_texto text,                         -- lo que escribió si no estaba en la lista
  veredicto jsonb,
  atendido_at timestamptz,
  atendido_by text,
  nota text
);
CREATE INDEX IF NOT EXISTS idx_upgrade_leads_created ON upgrade_simulator_leads (created_at DESC);

ALTER TABLE upgrade_institutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE upgrade_careers ENABLE ROW LEVEL SECURITY;
ALTER TABLE upgrade_institute_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE upgrade_simulator_leads ENABLE ROW LEVEL SECURITY;
GRANT ALL ON upgrade_institutes TO service_role;
GRANT ALL ON upgrade_careers TO service_role;
GRANT ALL ON upgrade_institute_programs TO service_role;
GRANT ALL ON upgrade_simulator_leads TO service_role;
