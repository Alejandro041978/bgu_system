-- ============================================================================
-- Supervisor multi-bot: permitir un reporte por (fecha, bot) en vez de solo por fecha.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

-- Quitar la unicidad antigua sobre report_date (nombre puede variar; se intentan ambos)
alter table sofia_supervisor_reports drop constraint if exists sofia_supervisor_reports_report_date_key;
drop index if exists sofia_supervisor_reports_report_date_key;

-- Unicidad compuesta (fecha + bot)
create unique index if not exists sofia_supervisor_reports_date_bot_key
  on sofia_supervisor_reports(report_date, bot_key);
