-- ============================================================================
-- Columna faltante en los reportes del supervisor.
--   Sin ella, el UPDATE del reporte fallaba en silencio y quedaba "pendiente".
--   (El contenido igual se guarda dentro de full_report; esta columna alimenta
--    la sección "Vacíos de Conocimiento" del panel.)
-- Ejecutar en Supabase.
-- ============================================================================
alter table sofia_supervisor_reports add column if not exists knowledge_gaps text;
