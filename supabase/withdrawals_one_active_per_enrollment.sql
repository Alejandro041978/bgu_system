-- ---------------------------------------------------------------------------
-- Paso 4b: un solo retiro VIGENTE por matrícula.
--
-- Sí puede haber varios en el tiempo (IW → Re-Entry → IW de nuevo), pero
-- nunca dos abiertos a la vez sobre la misma matrícula. El LOA que pasa a IW
-- no choca: el LOA queda 'convertido_iw' antes de que el IW quede vigente.
--
-- EJECUTAR SOLO DESPUÉS de resolver los dos expedientes con dos IW vigentes
-- (Sujey Paria y Darwin Copari, 22/08/2026); con ellos abiertos el índice no
-- se puede crear.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS student_withdrawals_one_active_per_enrollment
  ON student_withdrawals (enrollment_id)
  WHERE status = 'vigente';
