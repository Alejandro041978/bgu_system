-- ---------------------------------------------------------------------------
-- Gestor de IW y Re-Entry: la cola de casos y su auditoría.
--
-- Un caso aparece solo (IW al registrarse el retiro; Re-Entry al pagarse el
-- trámite) y se cierra cuando alguien AUTORIZA la gestión en la pantalla. La
-- foto (snapshot) guarda todo lo que se presentó y lo que se escribió — es la
-- auditoría y también el deshacer: contiene las filas previas completas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS iw_reentry_gestiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('IW', 'REENTRY')),
  -- El disparador: student_withdrawals.id (IW) o tramite_requests.id (REENTRY)
  trigger_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'aplicado' CHECK (status IN ('aplicado', 'descartado')),
  snapshot jsonb,
  nota text,
  applied_by text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, trigger_id)
);

ALTER TABLE iw_reentry_gestiones ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE iw_reentry_gestiones IS
  'Gestiones autorizadas de IW/Re-Entry: ajuste de registro curricular y plan de pagos. El snapshot es auditoría y deshacer.';

-- El cierre de seguridad de Supabase revocó los privilegios por defecto: una
-- tabla nueva nace sin GRANT y el rol de servicio recibe "permission denied"
-- aunque RLS ni siquiera aplique para él. Pasó al sellar la primera gestión
-- (20/08/2026).
GRANT ALL ON TABLE iw_reentry_gestiones TO service_role;
