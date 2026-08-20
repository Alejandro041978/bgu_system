-- ---------------------------------------------------------------------------
-- Trazabilidad de la reincorporación: qué Re-entry levantó cada retiro.
--
-- Alexander Fustamante tiene dos IW reincorporados y dos cuotas de Re-entry
-- pagadas, y no había forma de decir cuál levantó a cuál: la única huella era
-- una nota de texto ("Reincorporado (hoja Re-entry).") heredada de la
-- importación (20/08/2026). Una reincorporación cuesta $35 y se paga: el
-- enlace al dinero es parte del expediente, no un comentario.
--
-- Tres columnas en el retiro:
--   · reincorporated_at                fecha en que se levantó
--   · reincorporated_tramite_id       el trámite que lo levantó (flujo actual)
--   · reincorporated_charge_external_id  la cuota de Re-entry pagada
--
-- El flujo de trámites las escribe desde hoy; lo histórico se rellena con el
-- backfill (emparejado cronológico cuota→retiro, solo casos sin ambigüedad).
-- ---------------------------------------------------------------------------
ALTER TABLE student_withdrawals
  ADD COLUMN IF NOT EXISTS reincorporated_at date;
ALTER TABLE student_withdrawals
  ADD COLUMN IF NOT EXISTS reincorporated_tramite_id uuid;
ALTER TABLE student_withdrawals
  ADD COLUMN IF NOT EXISTS reincorporated_charge_external_id text;

COMMENT ON COLUMN student_withdrawals.reincorporated_charge_external_id IS
  'Cuota de Re-entry (account_charges.external_id) cuyo pago levantó este retiro.';
