-- Vistos de WhatsApp: Twilio notifica el estado de cada mensaje saliente
-- (sent → delivered → read) al webhook /api/whatsapp/status, que lo guarda
-- aquí por el SID del mensaje.
alter table wa_messages add column if not exists twilio_sid text;
alter table wa_messages add column if not exists delivery_status text;
create index if not exists wa_messages_twilio_sid_idx on wa_messages (twilio_sid);
