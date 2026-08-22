-- Deshacer: vuelve a dejar BUS 340 de Osmar Medina como la dejó el gestor IW (22/08/2026).
BEGIN;
  UPDATE academic_course_enrollments SET status = 'retirada', closed_by = 'gestor-iw:alejandro.nunez@blackwell.university', closed_at = '2026-08-22T12:31:43.936+00:00' WHERE id = '3da6ec97-5849-4d7c-81ba-73e2b52545aa';
  UPDATE academic_grades SET course_enrollment_id = NULL WHERE external_id = '1418659b-5c6d-44fe-ac14-6cdb7f5b3117';
COMMIT;
