-- NO CORRER salvo que haya que deshacer las correcciones del 18-08-2026
-- de César Tumbaco (importe del giro) y Yujra López (giro caducado).

UPDATE account_payments SET amount = 156 WHERE id = '13240280-fcdb-4b84-8f96-985dcb571937';
UPDATE flywire_events SET amount_to = 71470315, status = 'online' WHERE id = 'b93be3c8-5989-46e2-8265-ffe51666dd21';
