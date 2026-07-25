-- Un ingreso de Books puede repartirse entre VARIAS cuotas (p. ej. un solo
-- depósito que junta enrollment + tuition). Cada porción es un pago serie BOOKS
-- que apunta a la operación de origen, para trazar y poder desasociar. Ejecutar en Supabase.
alter table account_payments add column if not exists books_operation_id uuid;
create index if not exists account_payments_books_op_idx on account_payments (books_operation_id);
