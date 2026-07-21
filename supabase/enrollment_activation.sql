-- Matrícula nativa con gate de pago:
--   la matrícula nace 'pendiente_pago' (solo crea el estado de cuenta) y se
--   ACTIVA cuando los conceptos iniciales se pagan (o por decisión manual).
--   La activación registra la malla completa en el acta, crea el correo
--   institucional y coloca en el carrusel (Moodle incluido).
-- Las matrículas históricas (sync de Activa) quedan 'activa'.
alter table academic_student_enrollments add column if not exists status text not null default 'activa';
alter table academic_student_enrollments add column if not exists activated_at timestamptz;
alter table academic_student_enrollments add column if not exists activated_by text;

-- Concepto inicial del estado de cuenta (matrícula/enrollment fee): la puerta
-- que abre la activación al pagarse.
alter table account_charges add column if not exists is_initial boolean not null default false;
