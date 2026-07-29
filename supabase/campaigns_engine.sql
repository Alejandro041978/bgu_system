-- ===========================================================================
-- Motor de campañas de Camila (multi-campaña)
--
-- Hasta ahora el único motor que ENVIABA era el de retención
-- (/api/cron/retention-campaign): cableado a retention_settings, bot
-- 'retencion' y retention_contacts. El modelo nuevo (campaigns +
-- campaign-resolver) sabía a QUIÉN contactar pero nadie enviaba:
-- campaign_contacts tenía 0 filas.
--
-- Esto completa el esquema para el motor genérico. Ejecutar en Supabase.
-- ===========================================================================

-- 1) Cada campaña manda sobre su propio envío: cupo diario, bot y plantilla.
alter table campaigns add column if not exists daily_cap int not null default 10;
alter table campaigns add column if not exists bot_key text not null default 'retencion';
alter table campaigns add column if not exists template_key text;

-- 2) Bitácora de contacto con todo lo necesario para auditar y medir.
alter table campaign_contacts add column if not exists language text;
alter table campaign_contacts add column if not exists template_key text;
alter table campaign_contacts add column if not exists twilio_sid text;
alter table campaign_contacts add column if not exists status text not null default 'sent';  -- sent | failed
alter table campaign_contacts add column if not exists error text;
alter table campaign_contacts add column if not exists replied_at timestamptz;
alter table campaign_contacts add column if not exists reason text;
alter table campaign_contacts add column if not exists created_at timestamptz not null default now();

create index if not exists cc_campaign_idx on campaign_contacts (campaign_key);
create index if not exists cc_student_idx  on campaign_contacts (student_id);
create index if not exists cc_sent_idx     on campaign_contacts (sent_at);

-- 3) Cupo y plantilla sugeridos por campaña (se ajustan desde el tablero).
--    Las plantillas se crean/aprueban en Twilio y se registran en
--    whatsapp_templates con estas mismas claves; hasta entonces la campaña no
--    puede enviar (el motor la salta y lo reporta).
update campaigns set template_key = 'camila_' || key       where template_key is null;
update campaigns set bot_key = 'retencion'                  where bot_key is null;
