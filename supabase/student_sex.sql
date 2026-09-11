-- Sexo del estudiante en la ficha (11/09/2026).
-- Pedido: cruces "por sexo" en los reportes (p. ej. resultados de la Encuesta
-- de Titulados). No existía ningún campo, así que se agrega a la ficha y se
-- puebla DEDUCIÉNDOLO del nombre de pila (decisión del usuario, errores
-- puntuales aceptados). sex_source distingue lo inferido de lo corregido a
-- mano: una corrección manual nunca debe ser pisada por una re-inferencia.
ALTER TABLE academic_students
  ADD COLUMN IF NOT EXISTS sex text CHECK (sex IN ('M', 'F')),
  ADD COLUMN IF NOT EXISTS sex_source text CHECK (sex_source IN ('inferida', 'manual'));

COMMENT ON COLUMN academic_students.sex IS 'M/F; NULL = sin clasificar. Poblado por inferencia del nombre (ver sex_source).';
COMMENT ON COLUMN academic_students.sex_source IS 'inferida = deducido del nombre de pila; manual = corregido por una persona (no re-inferir).';
