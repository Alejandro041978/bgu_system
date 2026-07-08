-- ============================================================================
-- ESTADOS DE CUENTA — deudas (cuotas) y pagos, cargados desde SystemActiva.
--
-- Modelo SystemActiva:
--   StudentAccount (estudiante × convocatoria)
--     └─ Installments (cuotas = DEUDA)  ←  Payments (PAGOS)
--   Saldo = Σ cuotas − Σ pagos.
--
-- Anclaje: Installment → StudentAccount.EnrollmentId = academic_student_enrollments.external_id
--          → de ahí sale student_id, enrollment_id, convocatoria_id.
-- Ejecutar en Supabase.
-- ============================================================================

-- Cuotas (deuda)
create table if not exists account_charges (
  id                              uuid primary key default gen_random_uuid(),
  external_id                     uuid not null,                                    -- = Installment.Id
  student_id                      uuid references academic_students(id),
  enrollment_id                   uuid references academic_student_enrollments(id),
  convocatoria_id                 uuid references convocatorias(id),
  amount                          numeric not null default 0,
  due_date                        date,
  charge_type                     integer,                                          -- Installment.Type (crudo)
  course_registration_external_id uuid,                                             -- Installment.CourseRegistrationId (opcional)
  created_at                      timestamptz not null default now(),
  constraint account_charges_external_id_key unique (external_id)
);
create index if not exists account_charges_student_idx    on account_charges(student_id);
create index if not exists account_charges_enrollment_idx on account_charges(enrollment_id);

-- Pagos
create table if not exists account_payments (
  id                     uuid primary key default gen_random_uuid(),
  external_id            uuid not null,                                             -- = Payment.Id
  charge_external_id     uuid,                                                      -- = Payment.InstallmentId (liga a account_charges.external_id)
  student_id             uuid references academic_students(id),
  amount                 numeric not null default 0,
  paid_date              date,
  disbursement_date      date,
  receipt_number         integer,
  series_code            text,
  transaction_reference  text,
  payment_type           integer,                                                   -- Payment.Type (crudo)
  created_at             timestamptz not null default now(),
  constraint account_payments_external_id_key unique (external_id)
);
create index if not exists account_payments_student_idx on account_payments(student_id);
create index if not exists account_payments_charge_idx  on account_payments(charge_external_id);
