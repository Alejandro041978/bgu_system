-- ---------------------------------------------------------------------------
-- Asignaturas electivas (fase 1: configuración) — 08/09/2026.
--
-- Modelo acordado con el usuario:
--  · La malla conserva CASILLAS electivas ("Electiva 1", "Electiva 2"…):
--    filas normales de academic_courses con is_elective=true. Cuentan para el
--    precio y el egreso como cualquier casilla; la casilla manda los créditos.
--  · Las OPCIONES (los 30 talleres, las 5 de una especialidad) son asignaturas
--    del MISMO programa con graduation_requirement=false — el motor de
--    egresados ya las excluye de la malla exigible.
--  · Un POOL agrupa opciones. Dos tipos:
--      'menu'        → el estudiante elige asignaturas sueltas del pool
--      'especialidad'→ se elige el pool COMPLETO y sus asignaturas llenan
--                      las casillas (MBA con especialidad en Marketing)
--  · La ELECCIÓN (fase 2) vive en student_electives: matrícula + casilla +
--    asignatura elegida. La especialidad elegida queda además en la matrícula
--    (specialty_pool_id) para que el degree pueda nombrarla.
--
-- Correr en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------

ALTER TABLE academic_courses ADD COLUMN IF NOT EXISTS is_elective boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN academic_courses.is_elective IS
  'Casilla electiva de la malla: cuenta para precio y egreso; qué asignatura la llena lo dice student_electives.';

CREATE TABLE IF NOT EXISTS elective_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES academic_programs(id),
  name text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('menu', 'especialidad')),
  nota text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, name)
);

CREATE TABLE IF NOT EXISTS elective_pool_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES elective_pools(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES academic_courses(id),
  UNIQUE (pool_id, course_id)
);

-- Fase 2 (elección): el esquema queda listo desde ya; el código llega después.
CREATE TABLE IF NOT EXISTS student_electives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES academic_student_enrollments(id),
  slot_course_id uuid NOT NULL REFERENCES academic_courses(id),   -- la casilla ("Electiva 2")
  chosen_course_id uuid NOT NULL REFERENCES academic_courses(id), -- la asignatura elegida
  pool_id uuid REFERENCES elective_pools(id),
  chosen_by text,
  chosen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, slot_course_id)   -- una casilla, una elección por matrícula
);

ALTER TABLE academic_student_enrollments ADD COLUMN IF NOT EXISTS specialty_pool_id uuid REFERENCES elective_pools(id);
COMMENT ON COLUMN academic_student_enrollments.specialty_pool_id IS
  'Especialidad elegida (pool tipo especialidad): permite que el degree diga "…con especialidad en X".';

ALTER TABLE elective_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE elective_pool_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_electives ENABLE ROW LEVEL SECURITY;
-- Sin GRANT, el rol de servicio recibe "permission denied" (lección 20/08/2026).
GRANT ALL ON TABLE elective_pools TO service_role;
GRANT ALL ON TABLE elective_pool_courses TO service_role;
GRANT ALL ON TABLE student_electives TO service_role;
