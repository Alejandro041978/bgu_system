-- ============================================================================
-- Número de caso por conversación del buzón (correo y WhatsApp).
--   Numeración correlativa y automática para nuevas conversaciones; rellena las
--   existentes en orden cronológico. Sirve para auditar caso por caso y para que
--   el equipo y el cliente puedan referirse a su caso.
-- Ejecutar en Supabase.
-- ============================================================================
create sequence if not exists wa_case_seq;
alter table wa_conversations add column if not exists case_number bigint;

-- Rellenar las existentes en orden cronológico
with ordered as (
  select id, row_number() over (order by created_at, id) as rn
  from wa_conversations
  where case_number is null
)
update wa_conversations c set case_number = o.rn
from ordered o where c.id = o.id;

-- Posicionar la secuencia por encima del máximo actual
select setval(
  'wa_case_seq',
  greatest(coalesce((select max(case_number) from wa_conversations), 0), 1),
  (select exists (select 1 from wa_conversations where case_number is not null))
);

-- Las nuevas conversaciones toman el siguiente número automáticamente
alter table wa_conversations alter column case_number set default nextval('wa_case_seq');
create index if not exists wa_conversations_case_idx on wa_conversations(case_number);
