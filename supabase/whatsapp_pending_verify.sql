-- ===========================================================================
-- Segunda verificación de identidad en WhatsApp
--
-- Sofía solo habla con estudiantes, así que identificar es el primer paso, no
-- un dato que se recoja por el camino. Y no todas las pruebas valen lo mismo:
--
--   · El TELÉFONO registrado es posesión: quien escribe desde él ya demostró
--     algo. Identifica por sí solo.
--   · Un DOCUMENTO es conocimiento: lo tiene cualquiera que conozca al
--     estudiante — un compañero, un familiar, una lista filtrada. Desde un
--     teléfono desconocido no basta.
--
-- Cuando llega un código desde un teléfono que no es el de esa ficha, la
-- conversación queda a la espera de una segunda prueba (el correo personal
-- registrado). Esta columna guarda a quién se está intentando verificar
-- mientras tanto.
-- ===========================================================================

alter table whatsapp_sessions add column if not exists pending_verify jsonb;

comment on column whatsapp_sessions.pending_verify is
  'Ficha reconocida por documento cuyo teléfono NO coincide con el remitente: espera la segunda prueba (correo personal). null = no hay verificación pendiente.';

grant all on table whatsapp_sessions to service_role;
