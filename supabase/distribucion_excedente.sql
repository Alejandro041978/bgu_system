-- ===========================================================================
-- Distribución del saldo a favor
--
-- Un giro de Flywire es UN pago que se asocia UNA vez. La base ya lo exige:
--
--   create unique index account_payments_flywire_idx
--     on account_payments(flywire_payment_id) where flywire_payment_id is not null;
--
-- Cuando el giro excede la cuota, el sobrante se abona a otras cuotas. Esos
-- abonos no son pagos nuevos —no entró más dinero— sino trozos del mismo giro
-- puestos donde corresponde. Se marcan con distributed_from_payment_id, igual
-- que un reembolso se marca con refund_of_payment_id: la fila dice de dónde
-- viene y deja de ser un hecho independiente.
--
-- Los abonos NO llevan flywire_payment_id (lo conserva el pago de origen, que
-- es el que representa al giro ante Flywire). Por eso el índice único sigue
-- cumpliéndose: un giro, una fila que lo encarna.
-- ===========================================================================

alter table account_payments
  add column if not exists distributed_from_payment_id uuid
    references account_payments(id) on delete set null;

create index if not exists account_payments_distributed_from_idx
  on account_payments (distributed_from_payment_id)
  where distributed_from_payment_id is not null;

comment on column account_payments.distributed_from_payment_id is
  'Abono procedente del saldo a favor de otro pago. La fila no es dinero nuevo: es parte del giro de origen aplicada a otra cuota.';

grant all on table account_payments to service_role;
