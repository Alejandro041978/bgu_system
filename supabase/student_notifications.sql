-- ---------------------------------------------------------------------------
-- Bitácora de notificaciones al estudiante (08/09/2026).
--
-- Todo correo que el ERP envía a un estudiante pasa por notificarEstudiante()
-- (lib/student-notifications.ts), que envía Y registra en el mismo acto.
-- Regla: si no está en la bitácora, no se envió. Un fallo de correo no
-- revierte el acto académico: queda 'fallida' con su error, reenviable.
--
-- Primeros emisores: LOA, IW (registro del retiro y conversión LOA→IW del
-- cron), Re-Entry (al atender el trámite) y Reversión (al autorizar en el
-- gestor). Los demás correos del ERP se irán sumando a la misma bitácora.
--
-- Correr en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS student_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES academic_students(id),
  enrollment_id uuid REFERENCES academic_student_enrollments(id),
  kind text NOT NULL,                      -- loa_aplicado | iw_aplicado | reentry_aplicado | reversion_aplicada | …
  subject text NOT NULL,
  body_html text NOT NULL,
  to_emails text[] NOT NULL DEFAULT '{}',  -- institucional y personal (decisión del usuario: a ambos)
  status text NOT NULL CHECK (status IN ('enviada', 'fallida')),
  error text,
  related_id uuid,                         -- el acto: retiro, trámite o gestión
  triggered_by text,                       -- persona (email) o motor (cron:…)
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_notifications_student ON student_notifications (student_id, sent_at DESC);

ALTER TABLE student_notifications ENABLE ROW LEVEL SECURITY;
-- Sin GRANT, el rol de servicio recibe "permission denied" (lección 20/08/2026).
GRANT ALL ON TABLE student_notifications TO service_role;

COMMENT ON TABLE student_notifications IS
  'Bitácora de correos del ERP al estudiante: se envía y se registra en el mismo acto; las fallidas quedan visibles y reenviables.';
