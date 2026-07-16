-- ============================================================================
-- Mejora continua de los bots.
--
--   Hoy los supervisores guardan PROSA (recommendations, knowledge_gaps): textos
--   que nadie aplica y que sólo se acumulan. Esta tabla los convierte en
--   sugerencias ATÓMICAS, TIPADAS y APLICABLES. Al aprobar una, el cambio se
--   aplica de verdad: se agrega al prompt del bot o a su base de conocimientos.
--   Así los bots mejoran en vez de llenarnos de recomendaciones.
--
--   type:
--     'prompt'    → un ajuste de comportamiento; content se agrega al prompt del bot.
--     'knowledge' → un dato que le faltaba; content se agrega como artículo
--                   (kb_question/kb_topic/kb_tags) a su base, con embeddings.
--   status:
--     'pending'  → propuesta por el supervisor, esperando revisión humana.
--     'approved' → aprobada Y aplicada (se agregó al prompt/base).
--     'rejected' → descartada.
-- Ejecutar en Supabase (activar RLS: sólo service role).
-- ============================================================================
create table if not exists supervisor_suggestions (
  id             uuid primary key default gen_random_uuid(),
  bot_key        text not null,
  report_date    date,
  type           text not null check (type in ('prompt', 'knowledge')),

  title          text not null,           -- el problema detectado (⚠)
  recommendation text,                    -- qué hacer, en una línea (✓)
  content        text not null,           -- el texto EXACTO a incorporar

  -- sólo para type='knowledge'
  kb_topic       text,
  kb_question    text,
  kb_tags        text,

  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  applied_at     timestamptz,             -- cuándo se aplicó
  applied_ref    text,                    -- id del artículo creado, o marca del bloque de prompt
  reviewed_by    uuid,
  created_at     timestamptz not null default now(),

  -- No repetir la misma sugerencia día tras día para el mismo bot.
  unique (bot_key, type, title)
);
create index if not exists supervisor_suggestions_status_idx on supervisor_suggestions(status);
create index if not exists supervisor_suggestions_bot_idx on supervisor_suggestions(bot_key);
