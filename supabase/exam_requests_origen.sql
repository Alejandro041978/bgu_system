-- ---------------------------------------------------------------------------
-- De dónde salió una solicitud de examen.
--
-- Hasta hoy solo había una puerta: el estudiante la pedía desde su portal. Al
-- abrir la segunda —Registros creándola en su nombre desde la Hoja de Control—
-- deja de ser obvio quién la pidió, y eso hay que poder responderlo después.
--
-- Es la misma lección de las 53 ediciones de notas: cuando dos manos pueden
-- hacer lo mismo, la fila tiene que decir cuál fue. Sin esto, dentro de seis
-- meses un cargo de $20 en el estado de cuenta de alguien no tiene autor.
-- ---------------------------------------------------------------------------

alter table public.exam_requests
  add column if not exists requested_source text not null default 'estudiante',
  add column if not exists requested_by     text;

comment on column public.exam_requests.requested_source is
  'estudiante = la pidió desde su portal · erp = la creó un colaborador en su nombre.';
comment on column public.exam_requests.requested_by is
  'Correo del colaborador que la creó. Null cuando la pidió el propio estudiante.';

-- Las que ya existen son todas del portal: es la única vía que hubo hasta hoy,
-- así que el default las describe bien y no hay nada que rellenar.

select requested_source, count(*) from public.exam_requests group by requested_source;
