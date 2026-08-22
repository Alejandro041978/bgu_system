-- ---------------------------------------------------------------------------
-- El retiro pertenece a la MATRÍCULA, no al estudiante (regla del usuario,
-- 22/08/2026). Un estudiante puede retirarse de un programa y seguir en otro,
-- y tener varios retiros en el tiempo sobre la misma matrícula
-- (IW → Re-Entry → IW). Programa y categoría se derivan de aquí.
--
-- Paso 1: la columna, nullable mientras se rellena el histórico (514 retiros:
-- 509 con una sola matrícula, 5 a resolver). En el paso 4 se vuelve NOT NULL
-- y se añade la regla de "un solo retiro vigente por matrícula".
-- ---------------------------------------------------------------------------
ALTER TABLE student_withdrawals
  ADD COLUMN IF NOT EXISTS enrollment_id uuid REFERENCES academic_student_enrollments(id);

CREATE INDEX IF NOT EXISTS student_withdrawals_enrollment_idx
  ON student_withdrawals (enrollment_id);

COMMENT ON COLUMN student_withdrawals.enrollment_id IS
  'Matrícula (estudiante × programa) a la que pertenece el retiro. Programa y categoría se derivan de aquí.';
