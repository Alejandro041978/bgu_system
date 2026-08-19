-- Deshacer: devuelve a NULL el estado_academico de las 16 notas rellenadas el 18/08/2026.
BEGIN;
  UPDATE academic_grades SET estado_academico = NULL WHERE external_id IN (
    '1507b0e0-970a-4d81-9bfa-b11174b6d1b6',
    '154335e3-f62c-4c0f-aafb-1805e6769049',
    '1da79f18-7e62-4c6e-9cd9-874c3fc2f7c9',
    '3c5f511d-fe73-44fe-9029-3aee5f6aab82',
    '7f68a998-2d88-4d9c-af7c-ea3ac3f0a175',
    '86b7d264-4b31-4a2a-a081-3bfd613d8fe3',
    '9b4e261c-6549-4cca-a996-ed3bc8eb5812',
    '9e7d2b9c-eca1-40d3-b2eb-2a4253630aa4',
    'ac766f9b-38ef-4d8c-91dc-ed8c54563362',
    'c7bdbd7b-52e5-42e5-a060-52f916008877',
    'c917b2be-f9bc-40b5-ad78-7352c1fc386b',
    'cad5865d-818a-4fe6-abde-6482ad8607fa',
    'db90b311-33f4-4ebb-ace3-9192a616a882',
    'eb83dabf-918d-4ba0-a7b8-d8019bdac9c9',
    'f68e264e-3306-49a9-88ee-f2725abbfe4d',
    'ffe6d311-731d-4ce8-ace5-5fe1824173f6'
  );
COMMIT;
