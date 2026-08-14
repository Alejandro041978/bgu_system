-- ---------------------------------------------------------------------------
-- Los 39 que quedaron en un semestre ya cerrado.
--
-- QUÉ PASÓ
-- La regla anterior —temporada del aula + año de ingreso— dejó a 39 notas en un
-- periodo que había TERMINADO antes de que su estudiante se matriculara. Son
-- los que ingresaron al final del año: Richar Ramos entró el 28-09-2025 y su
-- SUMMER 2025 había cerrado el 31-08. Angela Rodríguez entró el 29-12-2025 y su
-- FALL 2025 cerró el 28-12, por un día.
--
-- LA CORRECCIÓN
-- Se mantiene la temporada del aula y se toma la SIGUIENTE ocurrencia de esa
-- misma temporada que no hubiera terminado al matricularse. No cambia la regla:
-- le pone el único límite que le faltaba —nadie cursa un periodo ya cerrado—.
--
-- POR QUÉ NO ES "EMPEZAR DESPUÉS DEL INGRESO"
-- Ese fue mi error al verificar el lote anterior: pedí que el semestre empezara
-- después de la matrícula y eso da por imposible algo corriente, incorporarse
-- con el periodo en marcha. De las 159 que marcaba, 120 eran exactamente eso y
-- estaban bien. Lo imposible es que el semestre haya CERRADO antes.
-- ---------------------------------------------------------------------------

-- PASO 1 · Las que están mal ahora
select count(*) as en_semestre_cerrado
  from academic_grades g
  join academic_students st on st.document_number = g.document_number
  join academic_courses c on c.id = g.course_id
  join academic_student_enrollments e on e.student_id = st.id and e.program_id = c.program_id
  join academic_semesters s on s.id = g.semester_id
 where g.source = 'moodle' and g.withdrawn_at is null
   and s.end_date < e.enrollment_date::date;
-- Debe devolver 39.

-- PASO 2 · La corrección
-- → AY 25-26 SUMMER 2026  (2026-04-27 → 2026-08-23) · 35 nota(s)
--   Richar Ramos Flores            Project Management         aula 126   ingresó 2025-09-28 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Anthoanet Lizbeth Tito Cuito   Microeconomics             aula 159   ingresó 2025-12-22 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Margarita Maria Carrasco Pilar Project Management         aula 126   ingresó 2025-11-28 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Melissa Edith Torres Huarcusi  Project Management         aula 126   ingresó 2025-11-03 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Christhian Alonso Panta Farfan Project Management         aula 126   ingresó 2025-09-25 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Anaica Priscila Arevalo Angulo Microeconomics             aula 159   ingresó 2025-12-22 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Fiorela Antonieta García Condo Project Management         aula 126   ingresó 2025-09-28 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Cristopher Johnny Laurente Qui Project Management         aula 126   ingresó 2025-12-15 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Mirian Vanesa Mulluni Llanos   Project Management         aula 126   ingresó 2025-09-09 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Yemelyn Yadhira Centon Apaza   Project Management         aula 126   ingresó 2025-09-09 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Oscar Martin Barrios Espinoza  Microeconomics             aula 159   ingresó 2025-12-22 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Alejandra Milagros Tirado Alva Project Management         aula 126   ingresó 2025-12-30 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Bilha Yomira Cotrina Inga      Microeconomics             aula 159   ingresó 2025-09-28 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Lady Nicoll García Chambilla   Project Management         aula 126   ingresó 2025-12-22 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Ingrid Jackeline Ticona Mamani Project Management         aula 126   ingresó 2025-12-22 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Britza Senaida Apaza Cruz      Project Management         aula 126   ingresó 2025-12-22 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Andrea del Rosario Uruchi Ramo Microeconomics             aula 159   ingresó 2025-12-22 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Fernanda Magdiel Flores Silva  Project Management         aula 126   ingresó 2025-09-28 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Coral Stefany Condori Ticona   Microeconomics             aula 159   ingresó 2025-12-22 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Brandey Marcos Jair Venancio C Microeconomics             aula 159   ingresó 2025-09-14 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Sergio Deyvis Colque Caypa     Microeconomics             aula 159   ingresó 2025-12-22 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Lesly Gabriela Galvez Durand   Project Management         aula 126   ingresó 2025-09-28 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   EDITH ELIZABETH SARMIENTO CUTI Microeconomics             aula 159   ingresó 2025-12-22 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Veronica Patricia Zevallos Cha Project Management         aula 126   ingresó 2025-12-22 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Noe Chura Supa                 Project Management         aula 126   ingresó 2025-12-22 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Fiorela Betzabe Rejas Céspedes Project Management         aula 126   ingresó 2025-11-04 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Juan Isequiel Blas Cadillo     Project Management         aula 126   ingresó 2025-12-22 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Irene Siomara Rojas Lupaca     Microeconomics             aula 159   ingresó 2025-12-22 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Kevin Renato Rendon Monjaras   Project Management         aula 126   ingresó 2025-12-23 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Emili Yesenia Milla Herrera    Project Management         aula 126   ingresó 2025-10-09 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Robert Jerico Chacon Angeles   Project Management         aula 126   ingresó 2025-11-28 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Deysi Dina Chambilla Monje     Project Management         aula 126   ingresó 2025-09-23 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Zamir Lin Machaca Condori      Microeconomics             aula 159   ingresó 2025-09-28 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Luz Andrea Arucutipa Apaza     Project Management         aula 126   ingresó 2025-12-24 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
--   Pedro Martin Huerta Rospiglios Project Management         aula 126   ingresó 2025-10-23 · estaba en AY 24-25 SUMMER 2025 (cerró 2025-08-31)
update academic_grades set semester_id = '92d1996e-dcde-4ec5-9049-bbcae76f8781'
 where external_id in (
   '11feb2d7-e823-4b76-9d98-c5056f7bd4eb',
   '142aea01-a5f0-4d15-b86d-cbcfc9209ecd',
   '16c061ff-9341-4599-b63d-50ac230791e9',
   '258f2d1c-7d79-4891-8715-858e47df1fd1',
   '260e5c4b-6c0e-4ea5-a2c5-b162345a8325',
   '266b39a8-8b1b-496c-a4f6-bfc0de66a257',
   '2a5705b2-326b-46ec-bf44-89354233c910',
   '2ac148e1-7b8c-4c77-93c9-0643a3d90e18',
   '319e5faf-30b2-4567-98f2-ab9004ebed6d',
   '3230e157-d380-4281-a975-a5011f26291e',
   '37672341-05af-4321-938d-a29aebd4778c',
   '3efd8583-f66d-4d8d-ba6f-b1f7a45861bb',
   '3f98ef66-032c-4261-9aa3-ddff74cc06ba',
   '4b0842ff-423b-4ded-bd24-e0dba3e131e6',
   '524813a1-6b92-45c0-a6b2-1939512077f1',
   '5492bdfb-3c3e-47ed-bdda-4a5fdec94479',
   '54bfdeee-0379-4eca-a228-7b20203fafe9',
   '5637aa87-e0a5-4672-bb92-7a5caaee0bf7',
   '68d80006-a9c9-4bdc-a79b-a186387782a4',
   '73e8e6b4-1a6a-4d2d-904a-4cc73e61528b',
   '7ec79287-00b5-4a10-b546-f0141934e52a',
   '831163f4-ae09-4d4f-8a81-946c5c817096',
   '89d35004-72c6-4a7a-a88c-1148838f4b40',
   'b7ac84c9-7821-4fe4-af67-4281ef21654e',
   'b7dcf9c6-ab0a-421e-bb78-ffdb6fd50546',
   'b80d5a24-fbcb-41f5-83d5-d439a101602e',
   'c670d1a3-9b94-4687-bb3f-8203d0d9cbb8',
   'd0d2f675-fe94-446f-b45b-e124423df22d',
   'd30b182f-45cc-4a1b-a2a0-45fd73a227e5',
   'd76f69f7-c695-4bfd-b2d7-b9a11b3813ca',
   'dc5e9fbe-3fff-419f-b8b2-c26d96e2f5b0',
   'df81248f-7982-47a8-89cd-f81886f65042',
   'dffd7b60-e389-493c-813f-b0290a465cf8',
   'e06c7f3b-06c1-4b11-a7a2-005718d8d9a9',
   'e8c6c4b8-58dd-41b5-99f5-932129fa4073'
 );

-- → AY 26 - 27 FALL 2026  (2026-09-07 → 2027-01-03) · 3 nota(s)
--   Angela Maria Rodriguez de Peña Natural Language Processin aula 633   ingresó 2025-12-29 · estaba en AY 25-26 FALL 2025 (cerró 2025-12-28)
--   Nicolas Walter Aguilar Carazas Natural Language Processin aula 633   ingresó 2025-12-29 · estaba en AY 25-26 FALL 2025 (cerró 2025-12-28)
--   Dorytzalia Velásquez López     Digital Forensic Analysis  aula 609   ingresó 2025-12-29 · estaba en AY 25-26 FALL 2025 (cerró 2025-12-28)
update academic_grades set semester_id = '78e4ea47-bf10-4eba-ba88-4f5d20901262'
 where external_id in (
   '121127d9-4091-40ff-9268-064148441738',
   '671ce457-bea1-48b2-bb94-2b9c6e091fc7',
   'ef53e218-c6de-454a-8ca2-5289855aa1ec'
 );

-- → AY 24-25 SUMMER 2025  (2025-04-28 → 2025-08-31) · 1 nota(s)
--   Ruth Perez Capaquira           Project Management         aula 126   ingresó 2024-12-28 · estaba en AY 23-24 SUMMER 2024 (cerró 2024-08-25)
update academic_grades set semester_id = '26af58a6-a65f-43be-b2ee-08850cf3ec37'
 where external_id in (
   'c319a877-7307-455d-a8f6-713b99f9a4bc'
 );

-- PASO 3 · El invariante, ahora bien escrito
select count(*) as en_semestre_cerrado
  from academic_grades g
  join academic_students st on st.document_number = g.document_number
  join academic_courses c on c.id = g.course_id
  join academic_student_enrollments e on e.student_id = st.id and e.program_id = c.program_id
  join academic_semesters s on s.id = g.semester_id
 where g.source = 'moodle' and g.withdrawn_at is null
   and s.end_date < e.enrollment_date::date;
-- Debe devolver 0.

