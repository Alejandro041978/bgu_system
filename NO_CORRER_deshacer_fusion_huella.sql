-- Deshacer la fusion por huella del 20/08/2026.
BEGIN;
  UPDATE academic_grades SET intento = 2 WHERE external_id = '46635e1e-6566-46af-a1da-fa4eb6e265d5';
  UPDATE academic_grades SET intento = 2 WHERE external_id = '6edd4332-73c2-4f52-ae92-2d09f0153cf9';
  UPDATE academic_grades SET intento = 2 WHERE external_id = '93749ba5-9881-446e-ade4-0f7dd11755f0';
  UPDATE academic_grades SET withdrawn_at = NULL, withdrawn_by = NULL WHERE external_id = '35ebdd0b-d27b-4a4b-afc0-1ea0d166c6d1';
  UPDATE academic_grades SET withdrawn_at = NULL, withdrawn_by = NULL WHERE external_id = '511d1187-fdda-4880-ad33-ef439721ab50';
  UPDATE academic_grades SET withdrawn_at = NULL, withdrawn_by = NULL WHERE external_id = '0bb0bb75-5517-4797-b9c9-23fe317c02d7';
COMMIT;
