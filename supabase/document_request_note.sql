-- Texto del solicitante al pedir un documento (p. ej. Custom Attestation:
-- requerimientos especiales para embajadas o centros de trabajo). Si el tipo
-- define esta etiqueta, la solicitud exige un texto obligatorio que se guarda
-- en document_requests.field_values.request_note (merge tag REQUEST_NOTE).
-- Ejecutar con "Run and enable RLS".
alter table document_types add column if not exists request_note_label text;
