-- ============================================================
-- BGU ERP - Esquema de base de datos
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Roles del sistema
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Perfiles de usuarios (extiende auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role_id UUID REFERENCES roles(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tokens de Zoho (guardados de forma segura)
CREATE TABLE zoho_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  organization_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Revisiones de tickets con IA
CREATE TABLE ticket_ai_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL,
  agent_id UUID REFERENCES profiles(id),
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  sentiment TEXT NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  response_quality TEXT NOT NULL CHECK (response_quality IN ('excellent', 'good', 'average', 'poor')),
  empathy_score INTEGER NOT NULL CHECK (empathy_score >= 0 AND empathy_score <= 100),
  resolution_score INTEGER NOT NULL CHECK (resolution_score >= 0 AND resolution_score <= 100),
  professionalism_score INTEGER NOT NULL CHECK (professionalism_score >= 0 AND professionalism_score <= 100),
  feedback TEXT NOT NULL,
  suggestions TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Meses calidad (periodos de evaluación)
CREATE TABLE quality_months (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  calendar_month INTEGER NOT NULL CHECK (calendar_month >= 1 AND calendar_month <= 12),
  calendar_year INTEGER NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_dates CHECK (end_date > start_date)
);

-- KPIs de colaboradores por mes calidad
CREATE TABLE collaborator_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quality_month_id UUID NOT NULL REFERENCES quality_months(id),
  kpi_type TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  actual_value NUMERIC,
  score NUMERIC,
  bonus_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, quality_month_id, kpi_type)
);

-- ============================================================
-- Roles de Seguridad (RLS)
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_ai_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaborator_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoho_tokens ENABLE ROW LEVEL SECURITY;

-- Perfiles: cada usuario ve el suyo; admins ven todos
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'superadmin'
    )
  );

CREATE POLICY "Admins can update profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('superadmin', 'admin')
    )
  );

-- Ticket AI reviews: solo admins y supervisores
CREATE POLICY "Admins view all ai reviews" ON ticket_ai_reviews
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('superadmin', 'admin', 'supervisor')
    )
  );

CREATE POLICY "Service role insert ai reviews" ON ticket_ai_reviews
  FOR INSERT WITH CHECK (true);

-- Meses calidad: todos los autenticados pueden ver
CREATE POLICY "Authenticated users view quality months" ON quality_months
  FOR SELECT TO authenticated USING (true);

-- KPIs: colaboradores ven los suyos; admins ven todos
CREATE POLICY "Users view own kpis" ON collaborator_kpis
  FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "Admins view all kpis" ON collaborator_kpis
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('superadmin', 'admin', 'supervisor')
    )
  );

-- Zoho tokens: solo service role
CREATE POLICY "Service role only for zoho tokens" ON zoho_tokens
  USING (false);

-- ============================================================
-- Función para crear perfil automáticamente al registrarse
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Datos iniciales
-- ============================================================

INSERT INTO roles (name, description, permissions) VALUES
  ('superadmin', 'Super Administrador con acceso total', '{"all": true}'::jsonb),
  ('admin', 'Administrador', '{"desk": {"view": true, "edit": true, "reply": true}, "finance": {"view": true}, "hr": {"view": true, "edit": true}, "kpis": {"view": true, "edit": true}}'::jsonb),
  ('supervisor', 'Supervisor de área', '{"desk": {"view": true, "reply": true}, "kpis": {"view": true}}'::jsonb),
  ('agent', 'Agente de soporte', '{"desk": {"view": true, "reply": true}}'::jsonb),
  ('collaborator', 'Colaborador general', '{"kpis": {"view_own": true}}'::jsonb);
