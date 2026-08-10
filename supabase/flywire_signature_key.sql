-- ===========================================================================
-- Que rastro deja la firma de cada notificacion de Flywire.
--
-- El 10/08/2026 las notificaciones de produccion validaban y las de Demo no,
-- con el mismo secreto configurado. Dos explicaciones posibles: Demo firma con
-- otra clave, o los callbacks definidos por transaccion no se firman igual.
-- Discutirlo sin datos no lleva a ninguna parte.
--
-- El webhook prueba ahora las claves configuradas (FLYWIRE_SHARED_SECRET y
-- FLYWIRE_SHARED_SECRET_DEMO) y anota cual valido. Con eso, la proxima
-- notificacion contesta la pregunta sola.
-- ===========================================================================

alter table flywire_events add column if not exists signature_key text;

comment on column flywire_events.signature_key is
  'Nombre de la clave con la que valido la firma (principal|demo), o null si ninguna.';
