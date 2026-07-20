-- Bandeja de conciliación: marcar un pago como "sin cuota" a propósito
-- (adelantos, pagos libres) para sacarlo de la bandeja sin inventarle enlace.
alter table account_payments
  add column if not exists reconciled_no_charge boolean not null default false;
