-- ===========================================================================
-- Constancia de las corridas automáticas
--
-- Hasta ahora ningún cron dejaba rastro de haber corrido. Nadie podía saber si
-- lo que veía en pantalla era de hoy o de hace tres semanas — y ése es
-- exactamente el punto ciego que permitió que 59 cuentas morosas quedaran
-- abiertas durante semanas sin que nadie lo notara: el proceso "había corrido",
-- pero no había forma de comprobarlo ni de ver qué había hecho.
--
-- Empieza con la reconciliación de accesos. Los demás crons pueden escribir
-- aquí cuando convenga, sin cambiar nada de esto.
-- ===========================================================================

create table if not exists system_job_runs (
  id       bigserial primary key,
  job      text not null,
  ran_at   timestamptz not null default now(),
  ok       boolean not null default true,
  summary  jsonb,
  errors   jsonb
);

create index if not exists idx_job_runs on system_job_runs (job, ran_at desc);

alter table system_job_runs enable row level security;
grant all on table system_job_runs to service_role;
grant usage, select on sequence system_job_runs_id_seq to service_role;


-- ── Verificación ───────────────────────────────────────────────────────────
select job, count(*) as corridas, max(ran_at) as ultima
  from system_job_runs group by job;
