-- ============================================================================
-- Hora de cierre del caso, para medir el tiempo de resolución.
--   Se setea al cerrar y se limpia al reabrir. Backfill histórico: a los ya
--   cerrados se les aproxima con updated_at (mejor dato disponible).
-- Ejecutar en Supabase.
-- ============================================================================
alter table wa_conversations add column if not exists closed_at timestamptz;

-- Backfill histórico (aproximado)
update wa_conversations
set closed_at = updated_at
where status = 'closed' and closed_at is null;

create index if not exists wa_conversations_closed_idx on wa_conversations(closed_at);
