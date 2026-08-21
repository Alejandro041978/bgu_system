-- Deshacer la 2a fusion por huella (Moodle menor que Activa) del 20/08/2026.
BEGIN;
  UPDATE academic_grades SET intento = 2 WHERE external_id = '63f1f8db-a0f2-4a61-a172-d658414b4c66';
  UPDATE academic_grades SET intento = 2 WHERE external_id = '70779513-d9b5-4d64-a5f5-80993e75ec07';
  UPDATE academic_grades SET intento = 2 WHERE external_id = '74844254-5871-4dcf-a4d0-58cba3c9d72d';
  UPDATE academic_grades SET intento = 2 WHERE external_id = '98a7907b-69a4-437a-a270-408b68639a07';
  UPDATE academic_grades SET intento = 2 WHERE external_id = '9c3975c0-116e-4b51-a42d-9ac8e6d418a0';
  UPDATE academic_grades SET intento = 2 WHERE external_id = 'decab8c8-4dfc-4af9-a84e-d1207c3211d1';
  UPDATE academic_grades SET intento = 2 WHERE external_id = 'e2b5b3ba-35bd-4609-aad7-4dce00df4aa3';
  UPDATE academic_grades SET intento = 2 WHERE external_id = 'f80c1bb7-8439-4d7e-a12a-654ce35acfe8';
  UPDATE academic_grades SET withdrawn_at = NULL, withdrawn_by = NULL WHERE external_id = '7ab6334c-571b-4f04-8ded-f3a58db353e7';
  UPDATE academic_grades SET withdrawn_at = NULL, withdrawn_by = NULL WHERE external_id = 'ac766f9b-38ef-4d8c-91dc-ed8c54563362';
  UPDATE academic_grades SET withdrawn_at = NULL, withdrawn_by = NULL WHERE external_id = 'b923f568-adc0-4344-acb8-979292e0c56b';
  UPDATE academic_grades SET withdrawn_at = NULL, withdrawn_by = NULL WHERE external_id = 'b86e7638-25b3-46fb-93d1-f26e3998595f';
  UPDATE academic_grades SET withdrawn_at = NULL, withdrawn_by = NULL WHERE external_id = '7245524b-d97a-4465-a232-065617de1006';
  UPDATE academic_grades SET withdrawn_at = NULL, withdrawn_by = NULL WHERE external_id = '7f68a998-2d88-4d9c-af7c-ea3ac3f0a175';
  UPDATE academic_grades SET withdrawn_at = NULL, withdrawn_by = NULL WHERE external_id = 'f942102b-33ce-407f-9573-82519bca4e1b';
  UPDATE academic_grades SET withdrawn_at = NULL, withdrawn_by = NULL WHERE external_id = 'd01196b5-37b2-404e-bd7b-7147ec192747';
COMMIT;
