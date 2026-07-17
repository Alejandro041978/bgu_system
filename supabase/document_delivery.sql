-- ============================================================================
-- Titulación y entrega de documentos.
--
--   is_final_degree → marca los documentos que SON el título final (el Degree
--     de Bachelor/Master/Doctor, el Certificate de DCE). Al emitirse uno, el
--     estudiante deja de ser "egresado" y pasa a "titulado" en ese programa.
--
--   delivery_mode → un documento puede ser electrónico, físico o ambos. Los que
--     tienen componente físico necesitan un CARGO DE ENTREGA: la constancia de
--     que el estudiante lo recibió.
--
--   delivery_method → cómo se capturó ese cargo. Hoy 'pdf' (se sube el cargo
--     escaneado); mañana 'firma_tableta' (firma en el momento de la entrega).
--     Se deja el campo abierto para que agregar la firma no obligue a rehacer
--     el modelo.
-- Ejecutar en Supabase.
-- ============================================================================
alter table document_types add column if not exists is_final_degree boolean not null default false;
alter table document_types add column if not exists delivery_mode text not null default 'electronico'
  check (delivery_mode in ('electronico', 'fisico', 'ambos'));

alter table document_requests add column if not exists delivered_at      timestamptz;
alter table document_requests add column if not exists delivery_proof_url text;
alter table document_requests add column if not exists delivery_method   text
  check (delivery_method is null or delivery_method in ('pdf', 'firma_tableta'));
alter table document_requests add column if not exists delivered_by      uuid;

-- Cuándo se tituló (además del estado), para poder reportar por período.
alter table student_graduations add column if not exists titulado_at date;
-- De dónde salió el dato: 'emision' (lo generó el ERP) | 'importacion' (lista histórica)
alter table student_graduations add column if not exists titulacion_source text;

create index if not exists document_requests_delivered_idx on document_requests(delivered_at);
create index if not exists student_graduations_titulado_idx on student_graduations(titulado_at);
