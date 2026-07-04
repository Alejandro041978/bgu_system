-- ============================================================================
-- Sofia · Base de Conocimientos (RAG con pgvector)
-- Ejecutar en el SQL Editor de Supabase.
-- Embeddings: OpenAI text-embedding-3-small (1536 dimensiones)
-- ============================================================================

-- 1. Habilitar la extensión de vectores
create extension if not exists vector;

-- 2. Tabla de artículos (lo que el admin edita en Sofia · Config)
create table if not exists sofia_knowledge (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  content      text not null,
  category     text,
  enabled      boolean not null default true,
  chunk_count  integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 3. Tabla de fragmentos con embeddings (generados automáticamente)
create table if not exists sofia_knowledge_chunks (
  id            uuid primary key default gen_random_uuid(),
  knowledge_id  uuid not null references sofia_knowledge(id) on delete cascade,
  content       text not null,
  chunk_index   integer not null default 0,
  embedding     vector(1536),
  created_at    timestamptz not null default now()
);

-- 4. Índice para búsqueda por similitud (coseno)
create index if not exists sofia_chunks_embedding_idx
  on sofia_knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists sofia_chunks_knowledge_id_idx
  on sofia_knowledge_chunks(knowledge_id);

-- 5. Función de búsqueda semántica.
--    Recibe el embedding de la pregunta y devuelve los fragmentos más parecidos
--    de artículos habilitados, por encima de un umbral de similitud.
-- 5b. Columna en el reporte del supervisor para los vacíos de conocimiento detectados
alter table sofia_supervisor_reports
  add column if not exists knowledge_gaps text;

create or replace function match_sofia_knowledge(
  query_embedding vector(1536),
  match_threshold float default 0.30,
  match_count int default 5
)
returns table (
  chunk_id     uuid,
  knowledge_id uuid,
  title        text,
  content      text,
  similarity   float
)
language sql stable
as $$
  select
    c.id           as chunk_id,
    c.knowledge_id as knowledge_id,
    k.title        as title,
    c.content      as content,
    1 - (c.embedding <=> query_embedding) as similarity
  from sofia_knowledge_chunks c
  join sofia_knowledge k on k.id = c.knowledge_id
  where k.enabled = true
    and c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
