-- ---------------------------------------------------------------------------
-- Reversión (2026-09-03): reingreso ADMINISTRATIVO de un IW, sin pago.
--
-- La decide el personal desde Retiros (solo con IW vigente), entra al Gestor
-- de IW/Re-Entry como caso pendiente, proyecta igual que un Re-Entry y al
-- autorizar reincorpora al estudiante con sus asignaturas y su plan completo.
--
-- La Reversión pendiente es una fila status='pendiente' en la MISMA tabla de
-- gestiones (trigger_id = student_withdrawals.id): al autorizar o descartar,
-- esa fila se convierte en el sello — una sola fila por gestión, y el
-- UNIQUE (kind, trigger_id) sigue garantizando que no haya duplicados.
--
-- Correr en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------

ALTER TABLE iw_reentry_gestiones DROP CONSTRAINT IF EXISTS iw_reentry_gestiones_kind_check;
ALTER TABLE iw_reentry_gestiones ADD CONSTRAINT iw_reentry_gestiones_kind_check
  CHECK (kind IN ('IW', 'REENTRY', 'REVERSION'));

ALTER TABLE iw_reentry_gestiones DROP CONSTRAINT IF EXISTS iw_reentry_gestiones_status_check;
ALTER TABLE iw_reentry_gestiones ADD CONSTRAINT iw_reentry_gestiones_status_check
  CHECK (status IN ('aplicado', 'descartado', 'pendiente'));

COMMENT ON COLUMN iw_reentry_gestiones.status IS
  'aplicado/descartado = gestión sellada. pendiente = Reversión creada desde Retiros, esperando autorización en el gestor.';
