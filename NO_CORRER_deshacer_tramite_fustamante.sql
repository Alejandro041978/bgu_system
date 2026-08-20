-- Deshacer: devuelve a 'pagado' el tramite de Fustamante cerrado el 20/08/2026.
UPDATE tramite_requests SET status = 'pagado', attended_at = NULL, attended_by = NULL,
  resolution_note = NULL
WHERE id = '5285375a-7267-4aa7-94c8-1b57548a6c44';
