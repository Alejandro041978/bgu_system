-- ===========================================================================
-- Corrección del Cashpay de Ruth Eliana Chino Flores (74881252)
--
-- Se aplicó como 24 descuentos prorrateados. Dos consecuencias:
--   · 24 × 22.12 = 530.88, cuando la solicitud aprobada dice 530.78. El
--     redondeo por cuota se acumuló y regaló 10 centavos.
--   · Siguió viendo 24 vencimientos cuando lo que aceptó fue pagar una vez.
--
-- Se rehace como bono de monto fijo + una cuota única, que es como quedará el
-- módulo de ahora en adelante.
--
--   tuition (24 × 120) ........  2,880.00
--   bono Cash Pay (18.43%) ....   -530.78   ← el número de la solicitud B87788
--   cuota única ...............  2,349.22   vence 2026-08-06
--
-- Ejecutar en Supabase DESPUÉS de bonus_monto_fijo.sql.
-- Envuelto en transacción: o queda todo, o no queda nada.
-- ===========================================================================

begin;

-- 1. Fotografía previa (para verificar al final y poder revertir)
create table if not exists fix_cashpay_ruth_bak_20260731 as
  select * from account_charges
   where student_id = 'c7132f1a-fa7f-4097-81dd-3990bdb1ce17' and charge_type = 2;

-- 2. Los 24 descuentos prorrateados se van
delete from account_payments
 where student_id = 'c7132f1a-fa7f-4097-81dd-3990bdb1ce17'
   and series_code = 'DESCUENTO'
   and transaction_reference like '%B87788%';

-- 3. El bono, con el MONTO aprobado (no el porcentaje: el beneficio es la cifra)
insert into bonuses (student_id, enrollment_id, program_id, amount, percentage, reason, granted_at, granted_by)
values (
  'c7132f1a-fa7f-4097-81dd-3990bdb1ce17',
  '019f0433-c2b8-7177-b5e9-69d770279c29',
  'c8d7e55a-1877-4c3a-a23e-907ed607e8a4',
  530.78, null, 'Cash Pay', '2026-07-30', 'correccion-b87788'
);

-- 4. La cuota única, antes de borrar las viejas
insert into account_charges (external_id, student_id, enrollment_id, convocatoria_id, amount, due_date, charge_type, source, is_initial)
select gen_random_uuid(), student_id, enrollment_id, convocatoria_id, 2349.22, date '2026-08-06', 2, 'erp', false
  from account_charges
 where student_id = 'c7132f1a-fa7f-4097-81dd-3990bdb1ce17' and charge_type = 2
 limit 1;

-- 5. Fuera las 24 de 120 (la nueva ya existe y tiene otro monto)
delete from account_charges
 where student_id = 'c7132f1a-fa7f-4097-81dd-3990bdb1ce17'
   and charge_type = 2 and amount = 120;

-- 6. La solicitud apunta a la cuota que la materializa
update cashpay_requests
   set charges = (
        select jsonb_agg(external_id) from account_charges
         where student_id = 'c7132f1a-fa7f-4097-81dd-3990bdb1ce17' and charge_type = 2)
 where id = 'b87788b1-e1a9-4591-909e-45a68b93623f';

commit;

-- ── VERIFICACIÓN ───────────────────────────────────────────────────────────
-- Debe dar: 1 cuota tuition de 2349.22, 0 descuentos, 1 bono de 530.78.
select
  (select count(*) from account_charges where student_id = 'c7132f1a-fa7f-4097-81dd-3990bdb1ce17' and charge_type = 2) as cuotas_tuition,
  (select sum(amount) from account_charges where student_id = 'c7132f1a-fa7f-4097-81dd-3990bdb1ce17' and charge_type = 2) as suma_tuition,
  (select count(*) from account_payments where student_id = 'c7132f1a-fa7f-4097-81dd-3990bdb1ce17' and series_code = 'DESCUENTO') as descuentos,
  (select amount from bonuses where student_id = 'c7132f1a-fa7f-4097-81dd-3990bdb1ce17') as bono;

-- ── Reversa ────────────────────────────────────────────────────────────────
-- delete from account_charges where student_id = 'c7132f1a-fa7f-4097-81dd-3990bdb1ce17' and charge_type = 2;
-- insert into account_charges select * from fix_cashpay_ruth_bak_20260731;
-- delete from bonuses where student_id = 'c7132f1a-fa7f-4097-81dd-3990bdb1ce17' and granted_by = 'correccion-b87788';
-- (los 24 descuentos habría que rehacerlos a mano: se borraron a propósito)
