-- ---------------------------------------------------------------------------
-- Campus externo POR ESTUDIANTE (09/09/2026).
--
-- La marca por asignatura/programa (partner_campus) es todo-o-nada. Este es el
-- tercer nivel: un estudiante concreto cursa una asignatura concreta en otra
-- institución mientras sus compañeros la llevan en el aula de Moodle.
-- Efectos del par marcado: (1) su nota se ingresa en Notas de campus externo;
-- (2) el importador de actas de Moodle lo salta en esa asignatura;
-- (3) el aprovisionador lo excluye del aula (suspende si ya estaba).
--
-- Correr en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS external_campus_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES academic_students(id),
  course_id uuid NOT NULL REFERENCES academic_courses(id),
  note text,                               -- motivo: dónde la cursa (Coursera, TEP, …)
  created_by text,                         -- quién lo decidió (email)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_external_campus_students_course
  ON external_campus_students (course_id);

ALTER TABLE external_campus_students ENABLE ROW LEVEL SECURITY;
-- Sin GRANT, el rol de servicio recibe "permission denied" (lección 20/08/2026).
GRANT ALL ON TABLE external_campus_students TO service_role;

COMMENT ON TABLE external_campus_students IS
  'Pares estudiante+asignatura que se cursan en campus externo aunque la asignatura tenga aula de Moodle: nota manual, importador la salta, aula excluida.';
