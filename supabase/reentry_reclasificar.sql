-- ===========================================================================
-- Reclasificar los cobros de Re-entry que llegaron como "Miscellaneous"
--
-- La importación de Activa trajo 32 reingresos bajo el concepto 16 en vez del
-- 22. Buscar por concepto encontraba 8 de 40: cuatro de cada cinco reingresos
-- eran invisibles para cualquier reporte de ingresos por trámite.
--
-- Se identifican por monto exacto de 35 —no hay otro cobro de esa cuantía—,
-- cuota pagada, y un historial de retiro en el estudiante. No se exige que la
-- cuota sea posterior al retiro: muchas fechas de retiro son la fecha de
-- migración y no la real, así que ese orden no es confiable todavía.
--
-- Quedan fuera los que no tienen ningún retiro: sin una salida previa, un
-- reingreso no significa nada, y esos se revisan a mano.
--
-- reference deja rastro para poder deshacerlo.
-- ===========================================================================

update account_charges
   set charge_type = 22,
       reference = coalesce(reference || ' · ', '') || 'Reclasificado de Miscellaneous a Re-entry'
 where external_id in (
   '6d5c6665-8e9d-4622-9583-dfdf0bd3fad3',
   '321fc3d5-e954-454c-91f2-4c415d6f5ab0',
   'ac232a53-fd59-498a-9c7c-b866ddcf1486',
   'ac993966-6cfb-44a0-95d2-e925b60e01ca',
   '8be5ddc3-3fed-462a-a719-848e832d0916',
   '669cade0-a605-40e1-9c3f-a5ed02b0e36f',
   'ffcbbc1c-08a9-4eac-8675-43394b1e5717',
   'b920997f-cae5-4b85-841f-ce0b0ba0c368',
   '0aec95e8-699a-4049-8266-a44b12907b05',
   'a54b323a-85ad-43db-8afe-1e72fc84b644',
   '900709d7-e261-4330-ba2a-83c00d0e3feb',
   'c7b2ef78-a82c-47ec-bec9-28730ed2a307',
   '65effd43-bd15-40a2-916d-c4089840987a',
   'e7f23647-8e29-4beb-8f16-8e45a0ac14b3',
   'a5274ec1-5559-40a9-81e2-c8987ef75372',
   'd48f1fb4-c457-4929-bb4d-2225d02e3bf7',
   'f61969a4-3550-4edb-b0bb-d2c0197edc30',
   '0d65ca55-aa71-41bc-8576-430a91608024',
   '12fea3b8-2fdf-47b7-b816-52f17ee02e91',
   'c055ae82-d11a-4ec5-a54a-8ffc0491455f',
   '6d8609b2-cdd4-478c-aec8-12d452f36b67',
   '8059bdc7-363d-4fc1-a923-940236f830e0',
   'e5908eec-46c6-4a76-9a99-371fe0832a3b',
   '73a4fcf4-9274-497d-b4a1-01c4da2b44bf',
   '7eec1391-adf3-4b6b-b08a-e962fa97fde8',
   '2ef11209-ff8b-46c2-9987-75eb083e8b7d',
   'b475b414-e6a5-4535-bb06-5a397183dfae',
   'f8f42621-1124-4655-97a9-8d3dba749e9b',
   'c2582914-1795-42d9-9f95-4f6c4064e0ed',
   'ffbc29c4-db45-4da1-a104-fa6496c8a923'
 );

-- ── Verificación ──────────────────────────────────────────────────────────
select ac.charge_type, c.name, count(*)::text as cargos
  from account_charges ac
  left join account_concepts c on c.type_code = ac.charge_type
 where ac.amount = 35 group by 1,2 order by 1;


-- ===========================================================================
-- El trámite que reincorpora, declarado en el catálogo
--
-- Va como bandera y no por el nombre del trámite: mañana habrá otro que
-- también reincorpore y no debería hacer falta un despliegue para decirlo.
-- ===========================================================================
alter table tramite_types add column if not exists reincorporates boolean not null default false;
update tramite_types set reincorporates = true, updated_at = now() where name = 'Re-entry';


-- ===========================================================================
-- Los dos reingresos pagados que nunca se aplicaron
--
-- En los dos el pago es posterior al retiro, así que no son bajas nuevas:
-- son reingresos cobrados, conciliados y jamás ejecutados. Uno tiene además
-- la matrícula activa desde hace un año.
-- ===========================================================================
update student_withdrawals w
   set status = 'reincorporado'
  from academic_students s
 where s.id = w.student_id
   and w.status = 'vigente'
   and s.document_number in ('75101393', '80245084Q');

-- ── Verificación ──────────────────────────────────────────────────────────
select s.document_number, s.first_name || ' ' || s.last_name as estudiante,
       s.situation, w.type, w.withdrawal_date, w.status
  from student_withdrawals w join academic_students s on s.id = w.student_id
 where s.document_number in ('75101393', '80245084Q');
