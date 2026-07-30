-- ===========================================================================
-- Auditor del campus · ruta COMPLETA de la categoría de Moodle
--
-- El auditor construía la etiqueta subiendo UN solo nivel
-- ("Padre / Hija"), así que en un árbol de tres niveles mostraba la categoría
-- intermedia como si fuera la familia:
--
--   real   : Division of Continuing Education - DCE
--              └ Update Certificate (3 months)
--                  └ PPA en Coaching Ejecutivo
--   guardado: "Update Certificate (3 months) / PPA en Coaching Ejecutivo"
--
-- Resultado: la lista de familias del ERP mezclaba niveles y no coincidía con
-- lo que se ve en Moodle (Bachelors, Masters, Doctorate, DCE, Otros).
--
-- `categoria` pasa a guardar la ruta completa desde la raíz y `familia` la
-- categoría de primer nivel, que es la que agrupa de verdad.
--
-- Ejecutar en Supabase.
-- ===========================================================================

alter table moodle_aula_audit add column if not exists familia text;

create index if not exists moodle_aula_audit_familia_idx on moodle_aula_audit (familia);
