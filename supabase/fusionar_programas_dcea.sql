-- ===========================================================================
-- Fusionar los programas DCEA duplicados
--
-- Mental Health and Psychiatry y Clinical Psychology se crearon dos veces. La
-- sospecha inicial era que el duplicado fuese la versión en inglés; los datos
-- dijeron otra cosa: las 98 notas de esos 20 estudiantes salen de las aulas
-- 400-403, las españolas, y ninguno tiene una sola nota de las inglesas. Es un
-- duplicado en español del mismo programa, no otra versión.
--
--   MHP duplicado  DCEA-S24-MHP  713c1547…  20 matrículas, 98 notas
--   MHP correcto   DCEA-E25-MHP  105ab431…  tiene colecciones ES y EN
--   CP  duplicado  DCEA-E25-CP   4d0df983…  1 matrícula sin notas
--
-- Las 10 asignaturas de los duplicados son IDÉNTICAS en código y nombre a las
-- del programa correcto, así que el remapeo cruza por código y no por nombre.
--
-- Se ejecuta por pasos, con verificación entre cada uno. El orden importa: si
-- se mueve la matrícula antes que las notas, esos alumnos quedan con la malla
-- nueva y sus notas colgando de la vieja, y su acta los muestra todo pendiente.
-- ===========================================================================


-- ── PASO 1 · Las notas de MHP, a la asignatura equivalente ─────────────────
-- 98 filas, de las que 62 tienen nota puesta. Es el dato académico real de
-- esos 20 estudiantes: si se pierde el vínculo, se pierde su historial.
update academic_grades g
   set course_id = ok.id
  from academic_courses mal
  join academic_courses ok
    on ok.program_id = '105ab431-08a5-4dc5-b3ef-28d28e8bf7ae'
   and trim(ok.code) = trim(mal.code)
 where mal.program_id = '713c1547-647b-4393-a498-9aee277eaa08'
   and g.course_id = mal.id;

-- Y las matrículas por asignatura, que son la clave foránea que impide borrar.
update academic_course_enrollments ce
   set course_id = ok.id
  from academic_courses mal
  join academic_courses ok
    on ok.program_id = '105ab431-08a5-4dc5-b3ef-28d28e8bf7ae'
   and trim(ok.code) = trim(mal.code)
 where mal.program_id = '713c1547-647b-4393-a498-9aee277eaa08'
   and ce.course_id = mal.id;

select 'notas aún en el MHP duplicado (debe ser 0)' as control, count(*)::text as valor
  from academic_grades g join academic_courses c on c.id = g.course_id
 where c.program_id = '713c1547-647b-4393-a498-9aee277eaa08'
union all
select 'matrículas de asignatura aún en el duplicado (debe ser 0)', count(*)::text
  from academic_course_enrollments ce join academic_courses c on c.id = ce.course_id
 where c.program_id = '713c1547-647b-4393-a498-9aee277eaa08';


-- ── PASO 2 · Las 20 matrículas, al programa correcto y a la colección ES ───
-- ES y no EN: sus 98 notas vienen de las aulas 400, 401, 402 y 403, que son
-- las de la colección en español. Ninguno de los 20 tiene una sola nota de las
-- aulas inglesas. El duplicado no era una versión en inglés del programa —era
-- otro programa en español con los mismos alumnos.
update academic_student_enrollments
   set program_id    = '105ab431-08a5-4dc5-b3ef-28d28e8bf7ae',
       collection_id = '692fa4fb-7ff4-4fda-95d1-0ec0f28c8e2a'   -- DCEA MHP ES
 where program_id = '713c1547-647b-4393-a498-9aee277eaa08';

select 'matrículas movidas a MHP correcto' as control, count(*)::text as valor
  from academic_student_enrollments
 where program_id = '105ab431-08a5-4dc5-b3ef-28d28e8bf7ae'
union all
select '  · con la colección ES', count(*)::text
  from academic_student_enrollments
 where collection_id = '692fa4fb-7ff4-4fda-95d1-0ec0f28c8e2a';


-- ── PASO 3 · El grupo y el egreso ──────────────────────────────────────────
-- El egresado completó las 5 asignaturas: debe seguir figurando como egresado,
-- pero del programa que de verdad existe.
update academic_groups
   set program_id = '105ab431-08a5-4dc5-b3ef-28d28e8bf7ae'
 where program_id = '713c1547-647b-4393-a498-9aee277eaa08';

update student_graduations
   set program_id = '105ab431-08a5-4dc5-b3ef-28d28e8bf7ae'
 where program_id = '713c1547-647b-4393-a498-9aee277eaa08';


-- ── PASO 4 · Clinical Psychology: mover, no borrar ─────────────────────────
-- La primera versión de este paso borraba la matrícula, con el supuesto de que
-- era una inscripción de prueba de la oficina de e-learning. La base lo impidió
-- con una clave foránea, y tenía razón: esa matrícula tiene TRES CARGOS DE $150
-- PAGADOS —$450— traídos de SystemActiva. Hay una relación comercial detrás.
--
-- Sus 5 filas de nota están vacías y sin aula de origen: las creó la matrícula,
-- no una importación. Pagó y no llegó a cursar. Se la trata igual que a los 20
-- de MHP — se mueve al programa correcto, y los cargos la siguen porque cuelgan
-- del id de la matrícula, que no cambia.
update academic_grades g
   set course_id = ok.id
  from academic_courses mal
  join academic_courses ok
    on ok.program_id = 'a07f41ce-bd99-44ce-90c5-98c3bf246de6'
   and trim(ok.code) = trim(mal.code)
 where mal.program_id = '4d0df983-ed71-4358-9294-f67df2648ceb'
   and g.course_id = mal.id;

update academic_course_enrollments ce
   set course_id = ok.id
  from academic_courses mal
  join academic_courses ok
    on ok.program_id = 'a07f41ce-bd99-44ce-90c5-98c3bf246de6'
   and trim(ok.code) = trim(mal.code)
 where mal.program_id = '4d0df983-ed71-4358-9294-f67df2648ceb'
   and ce.course_id = mal.id;

update academic_student_enrollments
   set program_id    = 'a07f41ce-bd99-44ce-90c5-98c3bf246de6',
       collection_id = '6a50a610-c1ac-4a98-9a80-8a99dc3acc67'   -- DCEA CPS (ES)
 where program_id = '4d0df983-ed71-4358-9294-f67df2648ceb';

select 'notas aún en el CP duplicado (debe ser 0)' as control, count(*)::text as valor
  from academic_grades g join academic_courses c on c.id = g.course_id
 where c.program_id = '4d0df983-ed71-4358-9294-f67df2648ceb'
union all
select 'matrículas aún en el CP duplicado (debe ser 0)', count(*)::text
  from academic_student_enrollments where program_id = '4d0df983-ed71-4358-9294-f67df2648ceb'
union all
select 'sus 3 cargos siguen enlazados (debe ser 3)', count(*)::text
  from account_charges ch
  join academic_student_enrollments e on e.id = ch.enrollment_id
 where e.program_id = 'a07f41ce-bd99-44ce-90c5-98c3bf246de6'
   and e.student_id = 'a8c55238-a04e-477f-8808-c980af9ecdc2';


-- ── PASO 5 · Borrar los duplicados, ya vacíos ──────────────────────────────
delete from academic_courses
 where program_id in ('713c1547-647b-4393-a498-9aee277eaa08', '4d0df983-ed71-4358-9294-f67df2648ceb');

delete from academic_programs
 where id in ('713c1547-647b-4393-a498-9aee277eaa08', '4d0df983-ed71-4358-9294-f67df2648ceb');


-- ── Verificación final ────────────────────────────────────────────────────
select 'programas MHP/CP que quedan (debe ser 2)' as control, count(*)::text as valor
  from academic_programs where name in ('Mental Health and Psychiatry', 'Clinical Psychology')
union all
select 'matrículas en MHP correcto (debe ser 23)', count(*)::text
  from academic_student_enrollments where program_id = '105ab431-08a5-4dc5-b3ef-28d28e8bf7ae'
union all
select '  · de ellas en la colección ES (debe ser 20)', count(*)::text
  from academic_student_enrollments where collection_id = '692fa4fb-7ff4-4fda-95d1-0ec0f28c8e2a'
union all
select 'notas con valor de esos estudiantes (debe seguir siendo 62)', count(*)::text
  from academic_grades g join academic_courses c on c.id = g.course_id
 where c.program_id = '105ab431-08a5-4dc5-b3ef-28d28e8bf7ae'
   and (g.final_grade is not null or g.retake_grade is not null)
union all
select 'PROGRAMAS SIN COLECCIÓN con estudiantes (debe ser 0)', count(*)::text from (
  select p.id from academic_programs p
    join academic_student_enrollments e on e.program_id = p.id
   where p.partner_campus is not true
     and not exists (select 1 from moodle_collections mc where mc.program_id = p.id)
   group by p.id) t;
