-- Disponibilidad de tipos de documento por VARIAS categorías (antes solo una).
-- scope_category_id (singular) se conserva como legado: los lectores lo
-- pliegan dentro del arreglo. Ejecutar con "Run and enable RLS".
alter table document_types add column if not exists scope_category_ids jsonb not null default '[]'::jsonb;
