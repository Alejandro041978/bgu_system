-- Ejecutar en Supabase SQL Editor: https://supabase.com/dashboard/project/qpwhefuenpenoeujmplp/sql

create table if not exists ai_master_prompt (
  id int default 1 primary key check (id = 1),  -- siempre una sola fila
  prompt text not null,
  ticket_count int default 0,
  conversation_count int default 0,
  updated_at timestamptz default now()
);

-- Insertar fila inicial vacía (el cron la llenará en la primera ejecución)
insert into ai_master_prompt (id, prompt)
values (1, 'Eres Sofia, asistente virtual de Blackwell Global University (BGU). Ayudas a los estudiantes con amabilidad y precisión. Detecta automáticamente el idioma en que el estudiante escribe y responde siempre en ese mismo idioma. Si el estudiante cambia de idioma durante la conversación, adáptate de inmediato.')
on conflict (id) do nothing;
