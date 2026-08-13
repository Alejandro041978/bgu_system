-- ---------------------------------------------------------------------------
-- Bono Cash: un pago extraordinario que la asesora recibe JUNTO a su comisión.
--
-- Estaba modelado como otro tipo de admisión —10 de los 23 del catálogo son
-- variantes "… Bono Cash"— y por eso no funcionaba: el tipo es uno solo por
-- venta, así que elegir el bono significaba renunciar a la comisión. Ninguna
-- venta usa esos 10 tipos, y el bono se venía anotando en los comentarios.
--
-- El bono no es otro tipo: es un ATRIBUTO del tipo. "Advanced Program" cobra
-- $45 de comisión y $15 de bono; en la venta se marca si corresponde, y la
-- comisión de esa fila pasa a $60.
--
-- Así el emparejamiento queda estructural. Hoy, que "Máster Español Bono Cash
-- (Contractor)" corresponde a "Máster Español (Contractor)" solo se deduce del
-- nombre, y un nombre escrito distinto rompe la relación en silencio.
-- ---------------------------------------------------------------------------

alter table public.admission_types
  add column if not exists bonus_amount numeric;

comment on column public.admission_types.bonus_amount is
  'Bono Cash de este tipo de admisión: pago extraordinario que se suma a la comisión cuando la venta se marca con el bono. Null = este tipo no tiene bono.';

-- En la venta, el bono se congela igual que la comisión: cambiar el tarifario
-- no debe reescribir lo ya liquidado. Null = la venta no lleva bono.
alter table public.admission_sales
  add column if not exists bonus_amount numeric;

comment on column public.admission_sales.bonus_amount is
  'Snapshot del Bono Cash al asignar la venta. Null = sin bono.';

-- Traslado de los 10 tipos-bono a su tipo base. Los pares van escritos uno a
-- uno y no deducidos con un LIKE: es una migración que se corre una vez, y
-- prefiero que un par mal emparejado salte aquí a que se descubra en una
-- liquidación.
update public.admission_types base
   set bonus_amount = bono.commission
  from public.admission_types bono
 where bono.category_id = base.category_id
   and (base.name, bono.name) in (
     ('Advanced Program',                    'Advanced Program Bono Cash'),
     ('Bachelor Español',                    'Bachelor Español Bono Cash'),
     ('Doctorado (Contractor)',              'Doctorado Bono Cash (Contractor)'),
     ('Doctorado (Freelance)',               'Doctorado Bono Cash (Freelance)'),
     ('Máster Español (Contractor)',         'Máster Español Bono Cash (Contractor)'),
     ('Máster Español (Freelance)',          'Máster Español Bono Cash (Freelance)'),
     ('Máster Inglés (Contractor)',          'Máster Inglés Bono Cash (Contractor)'),
     ('Update Program',                      'Update Program Bono Cash'),
     ('Upgrade Convenio',                    'Upgrade Convenio Bono Cash'),
     ('Upgrade Externo',                     'Upgrade Externo Bono Cash'),
     ('Upgrade Neumann',                     'Upgrade Neumann Bono Cash')
   );

-- Y los tipos-bono se desactivan: no se borran porque borrar es irreversible y
-- no hace falta —ninguna venta los usa, así que desaparecen del desplegable y
-- ahí acaba su historia—.
update public.admission_types
   set active = false
 where name ilike '%bono cash%';

-- Verificación: cada tipo base con su bono, y ningún tipo-bono activo.
select name, commission, bonus_amount, active
  from public.admission_types
 where active
 order by name;
