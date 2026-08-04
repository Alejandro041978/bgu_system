-- ===========================================================================
-- Registro de acceso a las rutas que todavía no se pueden cerrar
--
-- Doce rutas de /api no tienen llamador conocido dentro del repo: o las usa una
-- integración externa —Flywire, Zoho, N8N— o son código muerto. Cerrarlas a
-- ciegas rompería un cobro o una respuesta de ticket, y el síntoma aparecería
-- lejos del cambio.
--
-- En vez de adivinar, se anota quién entra durante unos días. con_cookie_sesion
-- es lo que decide: un navegador con sesión la manda, un servidor externo no.
-- ===========================================================================

create table if not exists api_access_log (
  id                bigserial primary key,
  ruta              text not null,
  metodo            text,
  ip                text,
  user_agent        text,
  referer           text,
  con_cookie_sesion boolean not null default false,
  con_authorization boolean not null default false,
  at                timestamptz not null default now()
);

create index if not exists idx_api_log_ruta on api_access_log (ruta, at desc);

alter table api_access_log enable row level security;
grant all on table api_access_log to service_role;
grant usage, select on sequence api_access_log_id_seq to service_role;

-- ── Consulta para dentro de unos días ─────────────────────────────────────
-- Sin llamadas   → código muerto, se puede borrar la ruta.
-- Todas con cookie → la usa el ERP, se puede cerrar como las 26.
-- Alguna sin cookie → hay un cliente externo: hay que darle una llave propia.
select ruta,
       count(*)::text                                             as llamadas,
       count(*) filter (where con_cookie_sesion)::text             as con_sesion,
       count(*) filter (where not con_cookie_sesion)::text         as SIN_sesion,
       count(distinct ip)::text                                    as ips,
       max(at)::text                                               as ultima
  from api_access_log group by ruta order by 2 desc;
