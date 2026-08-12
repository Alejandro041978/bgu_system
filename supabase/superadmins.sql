-- ---------------------------------------------------------------------------
-- Quién es superadministrador. Por escrito.
--
-- Hasta hoy no había lista: superadmin era "el usuario que no tiene ficha de
-- colaborador, o la tiene sin rol". Una definición por ausencia, y las ausencias
-- se acumulan solas. Al contrastarla con las 625 cuentas del ERP la cumplían
-- nueve: las tres de Dirección y seis correos personales que no cruzan con
-- ninguna ficha —cuentas viejas, o estudiantes cuyo correo de acceso no es el
-- de su expediente—. Todas ellas podían editar una calificación.
--
-- Esta tabla es la lista. Sin política de RLS a propósito: solo la toca el
-- service_role desde el servidor, nadie la lee ni la escribe desde el navegador.
-- ---------------------------------------------------------------------------

create table if not exists public.app_superadmins (
  email      text primary key,
  nota       text,
  created_at timestamptz not null default now()
);

alter table public.app_superadmins enable row level security;

comment on table public.app_superadmins is
  'Cuentas con potestad de superadministrador (editar calificaciones, entre otras). Se administra a mano: agregar a alguien aquí es una decisión de Dirección.';

-- Las dos cuentas de Dirección que hoy ya lo son de hecho.
--
-- La tercera que cumplía la regla vieja era blackwell.university.cpul@gmail.com,
-- y NO va aquí: es el correo de acceso de un estudiante, Cleber Paulo Uría
-- (documento 43807576). Podía editar calificaciones por el mero hecho de no
-- tener ficha de colaborador.
--
-- Fabiola sí va, y con conocimiento de causa: tiene además ficha de estudiante
-- (72353779), personal que estudia aquí. Por eso el guard mira esta lista antes
-- que el cruce con estudiantes —si no, la ficha de alumna le habría quitado el
-- acceso a su propio trabajo.
insert into public.app_superadmins (email, nota) values
  ('alejandro.nunez@blackwell.university', 'Dirección'),
  ('fabiola.ortiz@balticec.com',           'Dirección — también tiene ficha de estudiante (72353779)')
on conflict (email) do nothing;

-- Para agregar a alguien más:
--   insert into public.app_superadmins (email, nota)
--   values ('correo@dominio', 'quién es y por qué');
-- Para quitarlo:
--   delete from public.app_superadmins where email = 'correo@dominio';
