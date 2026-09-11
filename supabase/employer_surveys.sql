-- Encuesta a EMPLEADORES (11/09/2026).
-- El elegible es el EMPLEADOR (jefe inmediato capturado por la encuesta de
-- titulados), identificado por su número E.164. Regla del usuario: si varios
-- titulados comparten empleador, UNA encuesta completada por año cubre a todos
-- los titulados asociados (por eso el vínculo es tabla aparte y la unicidad es
-- por teléfono + año académico).
CREATE TABLE IF NOT EXISTS employer_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- también es el token del enlace
  employer_phone text NOT NULL,                     -- E.164 (+51...), la identidad del empleador
  employer_name text,
  company text,
  language text NOT NULL DEFAULT 'es',
  academic_year_id uuid REFERENCES academic_years(id),  -- el CICLO anual (se fija al crear, no al completar)
  invited_count int NOT NULL DEFAULT 0,
  last_invited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  answers jsonb,
  UNIQUE (employer_phone, academic_year_id)
);

-- Titulados cubiertos por la encuesta de ese empleador. Se agregan según los
-- titulados lo van nombrando; si la encuesta ya está completada, el nuevo
-- titulado queda cubierto sin re-contactar al jefe.
CREATE TABLE IF NOT EXISTS employer_survey_students (
  survey_id uuid NOT NULL REFERENCES employer_surveys(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES academic_students(id),
  graduate_survey_id uuid REFERENCES graduate_surveys(id),
  position text,          -- puesto del titulado según su propia encuesta
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (survey_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_employer_surveys_year ON employer_surveys(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_employer_surveys_phone ON employer_surveys(employer_phone);
CREATE INDEX IF NOT EXISTS idx_employer_survey_students_student ON employer_survey_students(student_id);

ALTER TABLE employer_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_survey_students ENABLE ROW LEVEL SECURITY;
GRANT ALL ON employer_surveys TO service_role;
GRANT ALL ON employer_survey_students TO service_role;
