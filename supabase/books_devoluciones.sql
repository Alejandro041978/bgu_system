-- ===========================================================================
-- Devoluciones de Books asociadas al PAGO que reversan
--
-- Una devolución no se asocia a una deuda sino a un pago: es dinero que vuelve
-- al estudiante, así que su espejo natural es el pago que lo trajo.
--
-- Se registra como un `account_payments` NEGATIVO que hereda la cuota del pago
-- original — el mismo patrón que ya usan los reembolsos de Flywire. Con eso el
-- saldo (Σ cuotas − Σ pagos) revive solo, sin lógica aparte.
--
-- Lo que faltaba: saber CUÁNTO se le devolvió ya a un pago concreto. Sin el
-- vínculo, dos devoluciones podrían reversar el mismo pago dos veces y nada lo
-- impediría.
--
-- Ejecutar en Supabase.
-- ===========================================================================

alter table account_payments add column if not exists refund_of_payment_id uuid references account_payments(id) on delete set null;

create index if not exists account_payments_refund_of_idx on account_payments (refund_of_payment_id)
  where refund_of_payment_id is not null;
