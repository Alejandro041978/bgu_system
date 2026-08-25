-- Deshacer del desbloqueo de las 4 actas selladas el 25/08/2026 con notas
-- infladas por el bug de rawgrade (reparacion 2). Filas previas:
--   8f49bfb3-33a9-4b3b-ac15-440907109a25 aula=398 103 doc=1315046886 final=100 estado=aprobado
--   0726e5ff-9c61-4462-a0a6-5e7d31a44257 aula=402 103 doc=40221518349 final=51.67 estado=reprobado
--   f7f851e7-cb37-4a57-aad9-33f264fff8e1 aula=476 101 doc=8243906 final=100 estado=aprobado
--   5f29b0c5-3bd8-48d3-95cd-57b9258bd857 aula=337 MBA 603 doc=AISD911123MMNV final=100 estado=aprobado

UPDATE academic_grades SET locked_at = '2026-08-25T10:20:35.469+00:00' WHERE external_id = '8f49bfb3-33a9-4b3b-ac15-440907109a25';
UPDATE academic_grades SET locked_at = '2026-08-25T10:20:35.469+00:00' WHERE external_id = '0726e5ff-9c61-4462-a0a6-5e7d31a44257';
UPDATE academic_grades SET locked_at = '2026-08-25T10:20:35.469+00:00' WHERE external_id = 'f7f851e7-cb37-4a57-aad9-33f264fff8e1';
UPDATE academic_grades SET locked_at = '2026-08-25T10:20:35.469+00:00' WHERE external_id = '5f29b0c5-3bd8-48d3-95cd-57b9258bd857';
