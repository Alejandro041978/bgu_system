-- Asociar un ingreso de Zoho Books (que NO es desembolso de Flywire) a una cuota
-- del estado de cuenta → genera un pago serie BOOKS (el segundo camino seguro).
-- Guarda el enlace para trazabilidad y para poder revertir. Ejecutar en Supabase.
alter table books_operations add column if not exists associated_charge_external_id text;
alter table books_operations add column if not exists associated_payment_id uuid;
