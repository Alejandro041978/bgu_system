-- ---------------------------------------------------------------------------
-- Paso 4a: ningún retiro puede nacer suelto.
--
-- Los 514 retiros ya tienen matrícula (22/08/2026); desde aquí la columna es
-- obligatoria. Cualquier INSERT sin enrollment_id —un SQL directo, una
-- integración futura— falla en vez de crear un retiro sin dueño.
-- ---------------------------------------------------------------------------
ALTER TABLE student_withdrawals
  ALTER COLUMN enrollment_id SET NOT NULL;
