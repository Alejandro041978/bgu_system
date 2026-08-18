-- NO CORRER salvo que haya que devolver el pago de Jaime Castellanos (1709263410)
-- a como estaba: una sola fila de $300 sobre la cuota de tuition.

DELETE FROM account_payments WHERE distributed_from_payment_id = '9eb37c27-a94b-4b79-a4a5-8fed3ab3f67c';
UPDATE account_payments SET amount = 300 WHERE id = '9eb37c27-a94b-4b79-a4a5-8fed3ab3f67c';
