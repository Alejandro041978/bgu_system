-- ===========================================================================
-- Fusionar los programas DCEA duplicados
--
-- Mental Health and Psychiatry y Clinical Psychology se crearon dos veces: lo
-- que en realidad eran versiones en inglés de un mismo programa se dieron de
-- alta como programas aparte. Ahora que existen las colecciones, la versión en
-- inglés es una colección del programa correcto, no un programa nuevo.
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


-- ── PASO 2 · Las 20 matrículas, al programa correcto y a la colección EN ───
update academic_student_enrollments
   set program_id   = '105ab431-08a5-4dc5-b3ef-28d28e8bf7ae',
       collection_id = '6d32eb7d-0c9d-4bbe-969c-19d0356b7a12'   -- DCEA MHP EN
 where program_id = '713c1547-647b-4393-a498-9aee277eaa08';

select 'matrículas movidas a MHP correcto' as control, count(*)::text as valor
  from academic_student_enrollments
 where program_id = '105ab431-08a5-4dc5-b3ef-28d28e8bf7ae'
union all
select '  · con la colección EN', count(*)::text
  from academic_student_enrollments
 where collection_id = '6d32eb7d-0c9d-4bbe-969c-19d0356b7a12';


-- ── PASO 3 · El grupo y el egreso ──────────────────────────────────────────
-- El egresado completó las 5 asignaturas: debe seguir figurando como egresado,
-- pero del programa que de verdad existe.
update academic_groups
   set program_id = '105ab431-08a5-4dc5-b3ef-28d28e8bf7ae'
 where program_id = '713c1547-647b-4393-a498-9aee277eaa08';

update student_graduations
   set program_id = '105ab431-08a5-4dc5-b3ef-28d28e8bf7ae'
 where program_id = '713c1547-647b-4393-a498-9aee277eaa08';


-- ── PASO 4 · Clinical Psychology: la matrícula de prueba ───────────────────
-- Una sola persona, de la oficina de e-learning, que se matriculó para ver el
-- programa recién creado. Sus 5 filas de nota están TODAS vacías, así que no
-- se pierde ningún dato académico. Se borran solo las vacías: si alguna
-- tuviera valor, quedaría y el paso 5 fallaría avisando.
delete from academic_grades
 where course_id in (select id from academic_courses where program_id = '4d0df983-ed71-4358-9294-f67df2648ceb')
   and final_grade is null and retake_grade is null;

delete from academic_course_enrollments
 where course_id in (select id from academic_courses where program_id = '4d0df983-ed71-4358-9294-f67df2648ceb');

delete from academic_student_enrollments
 where program_id = '4d0df983-ed71-4358-9294-f67df2648ceb';


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
select '  · de ellas en la colección EN (debe ser 20)', count(*)::text
  from academic_student_enrollments where collection_id = '6d32eb7d-0c9d-4bbe-969c-19d0356b7a12'
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
