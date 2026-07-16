-- ============================================================================
-- Plantillas HSM de WhatsApp (Twilio Content SID).
--
--   Las plantillas se crean y aprueban en Meta, pero para ENVIARLAS por Twilio
--   no sirve el nombre: hace falta el ContentSid (HX...) que Twilio asigna al
--   sincronizar la plantilla aprobada desde la WABA. Fuera de la ventana de 24h
--   un mensaje de texto libre no se entrega; hay que mandar ContentSid +
--   ContentVariables.
--
--   Una fila por plantilla e idioma (mismo key, distinto language).
-- Ejecutar en Supabase.
-- ============================================================================
create table if not exists whatsapp_templates (
  key         text not null,               -- camila_retencion_dia1, ...
  language    text not null default 'es',  -- es | en
  content_sid text,                        -- HX... (de Twilio Content Template Builder)
  variables   jsonb,                       -- las que Twilio dice que espera
  bot_key     text,                        -- retencion
  active      boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (key, language)
);
-- variables: se guarda lo que reporta la API de Twilio, no lo que creemos haber
-- escrito. Al crear las plantillas pusimos {{name}} y {{days}}, pero Twilio las
-- convirtió a {{1}} y {{2}} antes de enviarlas a Meta: el nombre era sólo una
-- etiqueta de su UI. Si ContentVariables no calza con lo que la plantilla espera,
-- Twilio rechaza el envío. Por eso el motor arma las variables leyendo esto.

-- Este archivo es re-ejecutable: la primera versión se corrió con los nombres
-- viejos y sin esta columna, así que volver a correrlo deja todo al día.
alter table whatsapp_templates add column if not exists variables jsonb;

-- Los nombres viejos (creados a mano en Meta) ya no existen en Twilio: Twilio
-- no los importó y hubo que rehacer las plantillas desde su lado.
delete from whatsapp_templates
where key in ('camila_saludo_dia1', 'camila_seguimiento_dia3', 'camila_recordatorio_dia7', 'camila_ultimo_dia14');

-- Semilla. El key debe calzar EXACTO con el friendly_name en Twilio: así las
-- casa /api/cron/sync-templates para traer el ContentSid.
--
-- Se crean desde Twilio (no desde Meta): Twilio no importa de forma fiable las
-- plantillas creadas en Meta Business Manager, y sin ContentSid no se pueden
-- enviar. Twilio las manda a aprobar a Meta y les asigna el SID en el acto.
-- Nombres nuevos a propósito: ya existen unas en Meta con los nombres viejos, y
-- Meta rechaza duplicados (borrarlas primero arriesga el bloqueo del nombre).
insert into whatsapp_templates (key, language, bot_key) values
  ('camila_retencion_dia1',  'es', 'retencion'),
  ('camila_retencion_dia1',  'en', 'retencion'),
  ('camila_retencion_dia3',  'es', 'retencion'),
  ('camila_retencion_dia3',  'en', 'retencion'),
  ('camila_retencion_dia7',  'es', 'retencion'),
  ('camila_retencion_dia7',  'en', 'retencion'),
  ('camila_retencion_dia14', 'es', 'retencion'),
  ('camila_retencion_dia14', 'en', 'retencion')
on conflict (key, language) do nothing;

-- ---------------------------------------------------------------------------
-- Tope diario de la campaña. Existe porque el número es nuevo: Meta lo arranca
-- con ~250 destinatarios únicos por 24h y sin reputación, y hoy hay 683
-- estudiantes elegibles acumulados. Soltarlos todos de golpe quema la línea.
-- Se sube a medida que el quality rating aguante.
-- ---------------------------------------------------------------------------
create table if not exists retention_settings (
  id             int primary key default 1,
  daily_cap      integer not null default 50,
  enabled        boolean not null default false,  -- se enciende a mano
  updated_at     timestamptz not null default now(),
  check (id = 1)
);
insert into retention_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Deudores: fuera de la campaña por ahora.
--   Con saldo pendiente se les RESTRINGE el acceso al aula. O sea que no entran
--   porque los bloqueamos nosotros: preguntarles "¿por qué no has entrado?" con
--   la plantilla genérica es ofensivo y no lleva a nada.
--   Son el 74% del grupo de 7-13 días — justo al que la campaña prioriza.
--   Necesitan otra conversación: "tu acceso está restringido por el saldo, y con
--   un compromiso de pago te lo liberamos". Eso requiere su propia plantilla.
--   Se enciende cuando esa plantilla esté aprobada.
-- ---------------------------------------------------------------------------
alter table retention_settings add column if not exists contact_debtors boolean not null default false;
