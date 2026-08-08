-- ===========================================================================
-- Revertir un Cash Pay aprobado.
--
-- Aprobar un cashpay BORRA las cuotas pendientes y las reemplaza por una sola.
-- Si el estudiante después avisa que no puede cumplir el acuerdo, hay que
-- devolverle su plan — y hasta ahora no había con qué: las cuotas originales se
-- habían borrado sin dejar copia, y la solicitud pasaba a apuntar a la cuota
-- nueva, así que ni siquiera quedaba el rastro de cuáles eran.
--
-- replaced_charges guarda la fotografía completa de lo que se reemplazó. La
-- reversión las vuelve a insertar tal cual estaban: mismo external_id, mismo
-- importe, mismo vencimiento.
--
-- Las solicitudes aprobadas ANTES de esta columna se revierten igual, pero
-- reponiendo una única cuota por el importe bruto con el vencimiento más lejano
-- que se adelantó. No es su plan original —ése ya no existe— pero deja la deuda
-- correcta y el plan se rehace con Refacturar cuotas.
-- ===========================================================================

alter table cashpay_requests
  add column if not exists replaced_charges jsonb;

comment on column cashpay_requests.replaced_charges is
  'Fotografía de las cuotas que la aprobación borró. Sirve para revertir.';

-- 'anulada' ya estaba previsto en el check de status: es el estado de un
-- cashpay que se deshizo.
