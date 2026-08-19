-- Deshacer: devuelve a "pendiente" las 12 notas corregidas el 18/08/2026.
BEGIN;
  UPDATE academic_grades SET estado_academico = 'pendiente' WHERE external_id IN (
    '019cfc1a-f06a-75b3-8387-8d466a5330ca',
    '019cfc1a-f073-7191-ab3a-d7725a4193a0',
    '019cfc1a-f08a-7662-b521-bd2f2f28ef98',
    '019cfc1e-9a20-78e1-93fd-7d5e08a5d8e5',
    '019cfc1e-9a2c-7501-9912-4c6984bde6db',
    '019cfc1e-9a3a-7c59-8dc5-2623f2d70cf8',
    '019cfc1e-9a46-7ea1-8c6c-539fc4482d02',
    '019cfc1e-9a52-7c4d-94e7-57189e2642b9',
    '20f08225-3fa1-4da9-89f5-323c8b170a93',
    '57dda5bb-8f47-4877-aadd-d6aa0dd7481a',
    '62007f83-f500-4917-95ba-28bde19b3963',
    '881fc28f-3bc0-49aa-b9c7-f614f3be1a59'
  );
COMMIT;
