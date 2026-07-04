-- ============================================================================
-- Multi-bot: generaliza el sistema Sofia para soportar varios bots (Sofia, Antonella…)
-- Cada bot tiene su propio prompt, base de conocimientos, sesiones y conversaciones.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

-- 1. Registro de bots
create table if not exists bots (
  key           text primary key,             -- 'sofia', 'antonella'
  name          text not null,
  role          text,                          -- 'soporte' | 'ventas'
  prompt        text not null default '',
  twilio_number text,                          -- número WhatsApp del bot: 'whatsapp:+51...'
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Sembrar Sofia (copiando su prompt actual) y Antonella
insert into bots (key, name, role, prompt)
select 'sofia', 'Sofia', 'soporte', coalesce((select prompt from ai_master_prompt where id = 1), '')
on conflict (key) do nothing;

insert into bots (key, name, role, prompt)
values ('antonella', 'Antonella', 'ventas', '')
on conflict (key) do nothing;

-- 2. Etiquetar por bot las tablas compartidas (existentes → 'sofia')
alter table sofia_knowledge          add column if not exists bot_key text not null default 'sofia';
alter table sofia_conversations      add column if not exists bot_key text not null default 'sofia';
alter table sofia_supervisor_reports add column if not exists bot_key text not null default 'sofia';
alter table whatsapp_sessions        add column if not exists bot_key text not null default 'sofia';

create index if not exists sofia_knowledge_bot_key_idx on sofia_knowledge(bot_key);
create index if not exists sofia_conversations_bot_key_idx on sofia_conversations(bot_key);

-- 3. whatsapp_sessions: permitir el mismo teléfono en distintos bots
alter table whatsapp_sessions drop constraint if exists whatsapp_sessions_pkey;
alter table whatsapp_sessions drop constraint if exists whatsapp_sessions_phone_key;
drop index if exists whatsapp_sessions_phone_key;
create unique index if not exists whatsapp_sessions_phone_bot_key on whatsapp_sessions(phone, bot_key);

-- 4. Búsqueda de conocimiento filtrada por bot
drop function if exists match_sofia_knowledge(vector, float, int);
drop function if exists match_sofia_knowledge(vector, float, int, text);
create or replace function match_sofia_knowledge(
  query_embedding vector(1536),
  match_threshold float default 0.20,
  match_count int default 8,
  p_bot_key text default 'sofia'
)
returns table (
  chunk_id uuid, knowledge_id uuid, title text, content text, similarity float
)
language sql stable
as $$
  select c.id, c.knowledge_id, k.title, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from sofia_knowledge_chunks c
  join sofia_knowledge k on k.id = c.knowledge_id
  where k.enabled = true
    and k.bot_key = p_bot_key
    and c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- 5. Prospectos / embudo de ventas de Antonella
create table if not exists sales_leads (
  id               uuid primary key default gen_random_uuid(),
  bot_key          text not null default 'antonella',
  phone            text,
  name             text,
  email            text,
  program_interest text,             -- programa de interés
  prior_studies    text,             -- estudios previos declarados
  stage            text not null default 'nuevo',
     -- nuevo | contactable | calificado | interesado | inscrito | descartado
  qualified        boolean,          -- ¿cumple requisitos?
  notes            text,
  meta             jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_contact_at  timestamptz
);
create index if not exists sales_leads_stage_idx on sales_leads(stage);
create unique index if not exists sales_leads_phone_bot_idx on sales_leads(phone, bot_key);
