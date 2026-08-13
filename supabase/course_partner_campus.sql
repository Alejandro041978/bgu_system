-- ---------------------------------------------------------------------------
-- Campus socio a nivel de ASIGNATURA.
--
-- Ya existía en el programa: `academic_programs.partner_campus` marca los 15
-- programas que se dictan en otra institución y cuya nota nace en su plataforma.
-- Pero hay asignaturas sueltas dentro de programas normales que se cursan igual
-- de fuera —Coursera, Griky, el LMS de TEP, el de IISHS— y no tenían dónde
-- declararse. Medido el 12-08-2026: 19 asignaturas de seis programas con notas
-- escritas a mano, y ninguna de ellas tiene aula en Moodle, porque no se cursa
-- aquí.
--
-- Mismo nombre que en el programa a propósito: es el mismo concepto, cambia la
-- unidad. El alcance de la página de notas de campus socio pasa a ser la unión
-- de los dos: las asignaturas de un programa socio, más las asignaturas
-- marcadas una a una.
--
-- Se declara en Programas, junto a la malla, porque es una propiedad del plan
-- de estudios y la regula la Dirección Académica — no quien califica.
-- ---------------------------------------------------------------------------

alter table public.academic_courses
  add column if not exists partner_campus boolean not null default false;

comment on column public.academic_courses.partner_campus is
  'La asignatura se cursa en otra institución: su calificación nace fuera y se registra a mano. Su aula de Moodle, si la hubiera, da acceso pero no sincroniza notas.';

-- Ninguna semilla automática. La lista de candidatas se sacó de dónde cayeron
-- las notas escritas a mano, y ahí aparecían dos asignaturas de ABA que SÍ se
-- enseñan en nuestro Moodle: figuraban porque alguien les subió la nota, no
-- porque sean externas. Marcarlas por esa evidencia habría convertido un fraude
-- en una regla. Las marca una persona, en Programas.

select
  (select count(*) from public.academic_programs where partner_campus) as programas_campus_socio,
  (select count(*) from public.academic_courses  where partner_campus) as asignaturas_campus_socio,
  (select count(*) from public.academic_courses  where is_capstone)    as asignaturas_capstone;
