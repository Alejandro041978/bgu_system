-- ============================================================================
-- Tercer atributo del permiso: BORRAR.
--
-- Ver, editar y borrar son tres cosas distintas. Hay páginas donde corregir un
-- dato es rutina y eliminar el registro no debería estarlo —notas, matrículas,
-- pagos, documentos—, y hasta ahora quien podía editar podía borrar.
--
-- Nace en false para todos: nadie hereda por descuido un permiso que no tenía.
-- Los roles que sí deban borrar se marcan a mano en el configurador.
--
-- Ejecutar en Supabase (idempotente).
-- ============================================================================

alter table role_permissions add column if not exists can_delete boolean not null default false;

comment on column role_permissions.can_delete is
  'Puede eliminar registros de esa página. Implica can_edit e implica can_view.';

-- ── Registro de auditoría de permisos ──────────────────────────────────────
--
-- can_edit existía desde el principio y no se comprobaba en ningún sitio: 215
-- rutas de escritura, cero comprobaciones. Así que la configuración actual
-- nunca se sintió, y no describe cómo trabaja la gente: hay un director de
-- e-learning con 69 páginas visibles y CERO editables que lleva meses
-- editando con normalidad.
--
-- Encender el bloqueo de golpe apagaría media operación en la misma hora. Por
-- eso primero se registra: durante unos días se anota qué se HABRÍA bloqueado,
-- se corrigen los roles contra el uso real, y solo entonces se bloquea.
create table if not exists permission_audit (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  email      text,
  role_id    uuid,
  role_name  text,
  page_key   text,
  accion     text,          -- ver | editar | borrar
  metodo     text,
  ruta       text,
  -- false mientras estemos en modo auditoría (se dejó pasar), true cuando el
  -- modo estricto lo haya bloqueado de verdad.
  bloqueado  boolean not null default false
);

create index if not exists idx_permaudit_at   on permission_audit (at desc);
create index if not exists idx_permaudit_role on permission_audit (role_id, page_key);

alter table permission_audit enable row level security;
grant all on table permission_audit to service_role;
grant usage, select on sequence permission_audit_id_seq to service_role;

select
  (select count(*) from role_permissions where can_delete) as con_borrar,
  (select count(*) from role_permissions)                  as permisos;
