-- Deshacer: vuelve a unir el deposito de $12.263 (asiento 1135) con ZBL2026-04-08 ($12.663).
-- Se desconectaron el 18/08/2026 porque los importes no son el mismo dinero.
BEGIN;
  UPDATE books_operations SET flywire_disbursement_id = 'ZBL2026-04-08', gestion_status = 'pendiente',
    gestion_note = 'Desembolso Flywire ZBL2026-04-08 (2026-04-08) · comisión 400.00 · asociado manual', gestion_by = 'alejandro.nunez@blackwell.university',
    gestion_at = '2026-08-18T08:20:21.523+00:00' WHERE id = '8e441886-1910-4df8-9c1b-58fb307cc36f';
  UPDATE flywire_disbursements SET matched_operation_id = '8e441886-1910-4df8-9c1b-58fb307cc36f' WHERE disbursement_id = 'ZBL2026-04-08';
COMMIT;
