-- ============================================================
-- BGU ERP - Tablas de sincronización Zoho Desk
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Tickets sincronizados desde Zoho Desk
CREATE TABLE desk_tickets (
  id TEXT PRIMARY KEY, -- ID de Zoho
  ticket_number TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  status_type TEXT NOT NULL, -- open | closed | on_hold
  priority TEXT NOT NULL,
  channel TEXT,
  department_id TEXT,
  department_name TEXT,
  contact_id TEXT,
  contact_name TEXT,
  contact_email TEXT,
  assignee_id TEXT,
  assignee_name TEXT,
  assignee_email TEXT,
  team_id TEXT,
  team_name TEXT,
  due_date TIMESTAMPTZ,
  is_overdue BOOLEAN DEFAULT FALSE,
  response_count INTEGER DEFAULT 0,
  customer_response_count INTEGER DEFAULT 0,
  first_response_time TIMESTAMPTZ,
  resolution_time TIMESTAMPTZ,
  closed_time TIMESTAMPTZ,
  cf JSONB DEFAULT '{}',
  zoho_created_at TIMESTAMPTZ NOT NULL,
  zoho_modified_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversaciones/respuestas de cada ticket
CREATE TABLE desk_conversations (
  id TEXT PRIMARY KEY, -- ID de Zoho
  ticket_id TEXT NOT NULL REFERENCES desk_tickets(id) ON DELETE CASCADE,
  author TEXT,
  author_type TEXT NOT NULL CHECK (author_type IN ('agent', 'enduser')),
  author_email TEXT,
  content TEXT,
  content_type TEXT DEFAULT 'html',
  is_edited BOOLEAN DEFAULT FALSE,
  zoho_created_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Log de sincronizaciones
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL, -- 'tickets' | 'conversations' | 'full'
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
  tickets_synced INTEGER DEFAULT 0,
  conversations_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- Índices para consultas frecuentes
CREATE INDEX idx_desk_tickets_status ON desk_tickets(status_type);
CREATE INDEX idx_desk_tickets_assignee ON desk_tickets(assignee_id);
CREATE INDEX idx_desk_tickets_department ON desk_tickets(department_id);
CREATE INDEX idx_desk_tickets_modified ON desk_tickets(zoho_modified_at DESC);
CREATE INDEX idx_desk_conversations_ticket ON desk_conversations(ticket_id);

-- RLS
ALTER TABLE desk_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE desk_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Tickets: usuarios autenticados pueden ver
CREATE POLICY "Authenticated users view tickets" ON desk_tickets
  FOR SELECT TO authenticated USING (true);

-- Conversaciones: usuarios autenticados pueden ver
CREATE POLICY "Authenticated users view conversations" ON desk_conversations
  FOR SELECT TO authenticated USING (true);

-- Sync logs: solo admins
CREATE POLICY "Admins view sync logs" ON sync_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('superadmin', 'admin')
    )
  );

-- Service role puede insertar/actualizar todo
CREATE POLICY "Service role manage tickets" ON desk_tickets
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role manage conversations" ON desk_conversations
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role manage sync logs" ON sync_logs
  FOR ALL USING (true) WITH CHECK (true);
