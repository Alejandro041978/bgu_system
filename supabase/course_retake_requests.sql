-- Solicitudes de recursado (12/09/2026): el recursado se DECLARA, no se deduce.
-- Flujo: un administrativo la crea sobre una asignatura cuyo último intento
-- está reprobado (estado calculado) → nace una cuota tuition NO fraccionable
-- asociada a la solicitud → al pagarse por completo, la solicitud se acepta
-- sola: se crea el intento N+1 en academic_course_enrollments y se abre el
-- recompletion en el LMS (manual mientras se evalúa el plugin). El importador
-- solo abre intentos declarados.
CREATE TABLE IF NOT EXISTS course_retake_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES academic_students(id),
  course_id uuid NOT NULL REFERENCES academic_courses(id),
  program_id uuid,
  program_enrollment_id uuid,                -- academic_student_enrollments.id (dónde se factura)
  prev_attempt int NOT NULL,
  new_attempt int NOT NULL,
  credits numeric,
  amount numeric,                            -- créditos × tarifa congelada de la matrícula
  charge_external_id text,                   -- la cuota asociada (account_charges.external_id)
  status text NOT NULL DEFAULT 'pendiente_pago' CHECK (status IN ('pendiente_pago', 'aceptada', 'anulada')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  lms_opened_at timestamptz,                 -- recompletion abierto en el aula (trazabilidad)
  lms_opened_by text,
  note text,
  UNIQUE (student_id, course_id, new_attempt)
);

CREATE INDEX IF NOT EXISTS idx_retake_requests_student ON course_retake_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_retake_requests_status ON course_retake_requests(status);

ALTER TABLE course_retake_requests ENABLE ROW LEVEL SECURITY;
GRANT ALL ON course_retake_requests TO service_role;
