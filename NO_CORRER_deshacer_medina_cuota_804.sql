-- Deshacer: elimina la cuota Tuition de $804 creada el 22/08/2026 para Osmar Medina (ajuste a 114 cr).
DELETE FROM account_charges WHERE external_id = 'd0c52791-bf24-4dd2-a959-09994dbbe770';
