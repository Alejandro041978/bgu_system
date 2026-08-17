-- NO CORRER salvo que haya que devolver la matrícula de Jhoel Zelada (75181253)
-- a como estaba antes del 17-08-2026.

UPDATE academic_student_enrollments
   SET convocatoria_id = NULL,
       enrollment_date = '2024-01-01'
 WHERE id = '966b40b8-9b06-4588-b17e-311584efc41a';
