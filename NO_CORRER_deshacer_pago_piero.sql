-- NO CORRER salvo que haya que devolver a $120 el pago ZBL813239654
-- de Piero Leon (74217250), corregido el 18-08-2026 según el CSV de Flywire.

UPDATE account_payments SET amount = 120 WHERE id = 'baa51741-3642-45da-abdf-4bbfcf926bc2';
