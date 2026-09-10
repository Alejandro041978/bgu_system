-- ---------------------------------------------------------------------------
-- Correo institucional del docente (@faculty.blackwell.university), 09/09/2026.
--
-- Mismo tenant de Google Workspace que los correos estudiantiles (confirmado
-- por el usuario): las mismas credenciales OAuth crean cuentas en ambos
-- dominios. El correo del docente vive en su ficha de colaborador.
--
-- Correr en el SQL Editor de Supabase.
-- ---------------------------------------------------------------------------

ALTER TABLE hr_employees
  ADD COLUMN IF NOT EXISTS faculty_email text,
  ADD COLUMN IF NOT EXISTS faculty_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS faculty_email_sent_to text;

-- Dos fichas no pueden reclamar el mismo correo institucional.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_employees_faculty_email
  ON hr_employees (lower(faculty_email)) WHERE faculty_email IS NOT NULL;

COMMENT ON COLUMN hr_employees.faculty_email IS
  'Correo institucional del docente en Google Workspace (@faculty.blackwell.university), creado desde la ficha del colaborador.';
