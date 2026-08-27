-- Acopio de la restauración de notas pisadas por la reestructuración de aulas
-- (26/08/2026). N8N postea aquí la última nota buena del historial de Moodle
-- por alumno y aula; el ensayo y la aplicación se corren después desde el ERP.
CREATE TABLE IF NOT EXISTS grade_restore_staging (
  aula        int         NOT NULL,
  idnumber    text        NOT NULL,
  nota        numeric     NOT NULL,
  fecha       timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aula, idnumber)
);

-- Solo service_role: es una mesa de trabajo interna, sin lectura de clientes.
ALTER TABLE grade_restore_staging ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE grade_restore_staging TO service_role;
