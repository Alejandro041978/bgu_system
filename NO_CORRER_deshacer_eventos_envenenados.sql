-- NO CORRER salvo que haya que devolver los 8 eventos de Flywire a como
-- estaban antes de corregirlos contra el portal el 18-08-2026.

UPDATE flywire_events SET amount_to = 0, status = 'Spain' WHERE id = '4e29cb82-0dda-4184-8e0b-62ff53488f7f';
UPDATE flywire_events SET amount_to = 0, status = 'Peru' WHERE id = '5f189f20-73b1-42ce-97a5-10d8c9e87c35';
UPDATE flywire_events SET amount_to = 0, status = 'Peru' WHERE id = 'a67e647a-3444-479a-a107-cd57d7c04bf2';
UPDATE flywire_events SET amount_to = 0, status = 'Peru' WHERE id = '52d4cbd2-450c-40fe-a77a-a56e520502db';
UPDATE flywire_events SET amount_to = 72313558, status = 'online' WHERE id = 'f40f72ab-d6c6-4a7b-adec-3a4632683278';
UPDATE flywire_events SET amount_to = 0, status = 'Peru' WHERE id = 'b38ef7c9-2491-4f24-b34b-15ac0e0936d2';
UPDATE flywire_events SET amount_to = 0, status = 'Peru' WHERE id = '8ee4e38f-f71e-4eb0-ab0d-1ac244e63a9a';
UPDATE flywire_events SET amount_to = 47147450, status = 'online' WHERE id = 'b3e4aaa5-a387-4e4d-bcb4-7eaf57d11855';
