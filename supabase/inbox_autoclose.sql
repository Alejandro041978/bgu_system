-- Cierre automático de casos del buzón (regla del usuario 2026-07-22: el
-- cierre NUNCA es manual). Tres vías: 24h sin respuesta del cliente tras la
-- respuesta del agente; evaluación del servicio (encuesta a las 6h); o
-- respuesta del agente juzgada concluyente.
alter table wa_conversations add column if not exists survey_sent_at timestamptz;
alter table wa_conversations add column if not exists rating text;          -- buena | regular | mala
alter table wa_conversations add column if not exists rating_at timestamptz;
alter table wa_conversations add column if not exists closed_reason text;   -- sin_respuesta_24h | evaluado | respuesta_concluyente | manual
