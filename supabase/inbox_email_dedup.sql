-- ============================================================================
-- Idempotencia de la ingesta de correos.
--   El Message-Id de un correo es único: dos filas con el mismo message_id son
--   el mismo correo entrado dos veces (reintento de N8N o reenvío de la
--   reconciliación). El índice único lo impide a nivel de base — es el guard
--   real contra la carrera que el chequeo en código no cubre.
--   Parcial (solo where message_id is not null) porque ~6% no lo traen.
-- Ejecutar en Supabase. (No hay duplicados actuales, así que no falla.)
-- ============================================================================
create unique index if not exists wa_messages_message_id_uniq
  on wa_messages (message_id)
  where message_id is not null;
