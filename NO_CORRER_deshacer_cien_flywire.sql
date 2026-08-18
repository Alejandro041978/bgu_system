-- Deshacer: los 23 pagos de $100 creados el 18/08/2026 para reflejar
-- lo que Flywire entrego de mas y el ERP no tenia registrado.
-- Correr SOLO si hay que revertir. Borra exactamente esas 23 filas y ninguna otra.
BEGIN;
  SELECT count(*) AS van_a_borrarse FROM account_payments WHERE external_id IN (
    '2f4e817d-9b31-4162-8f73-8f307a06faa8',
    '9926749a-b5c7-43a7-822a-1a3d6cb43757',
    '446b039a-034d-4801-b913-2baf6d1072b9',
    '11d06362-78a0-458b-a21c-c2aaec7fed67',
    '7130e637-6dc9-4573-adde-d1bea009063f',
    '905b6e7a-7083-416e-b2bf-81f60ab3e7c7',
    'fb84c6d1-7779-4ee3-8ba4-a7248d1bc1a4',
    '05e49157-f200-43b6-a6ed-73eba3df8c8a',
    '02c66e13-c8dd-4b86-9eb2-46960890b607',
    '9772aa0b-3bb0-4f61-919b-e844dacbfaa9',
    '00f51038-a52d-4d35-b337-94d425e5e09a',
    '049c1c90-5023-4357-8149-dd76b48e2a56',
    '083db230-50df-479a-9fad-ae5f05cdc68e',
    '4a438dbd-f288-4c50-bd3e-f22c2bd6e941',
    '7b0140be-056d-4e7e-8d2f-ceb5c66437fc',
    '8a49747d-e5fe-4c92-8884-246fd3835f03',
    '9fb81561-5337-4d96-994c-ca4214a3308c',
    '5b0f787a-b5ae-42cc-99db-c1147cbb2453',
    '758e9c79-5187-480a-bcf0-23135c1264d3',
    '9e0b34c1-9198-4ef0-9f2a-7eab3cdfc1dc',
    '4d984d2c-444f-47e9-bbbc-941f18419380',
    '6f39e20c-58ba-47a5-9397-456fbc803b46',
    'c44d1e06-70de-414f-bf04-a88b850bea5d'
  );
  DELETE FROM account_payments WHERE external_id IN (
    '2f4e817d-9b31-4162-8f73-8f307a06faa8',
    '9926749a-b5c7-43a7-822a-1a3d6cb43757',
    '446b039a-034d-4801-b913-2baf6d1072b9',
    '11d06362-78a0-458b-a21c-c2aaec7fed67',
    '7130e637-6dc9-4573-adde-d1bea009063f',
    '905b6e7a-7083-416e-b2bf-81f60ab3e7c7',
    'fb84c6d1-7779-4ee3-8ba4-a7248d1bc1a4',
    '05e49157-f200-43b6-a6ed-73eba3df8c8a',
    '02c66e13-c8dd-4b86-9eb2-46960890b607',
    '9772aa0b-3bb0-4f61-919b-e844dacbfaa9',
    '00f51038-a52d-4d35-b337-94d425e5e09a',
    '049c1c90-5023-4357-8149-dd76b48e2a56',
    '083db230-50df-479a-9fad-ae5f05cdc68e',
    '4a438dbd-f288-4c50-bd3e-f22c2bd6e941',
    '7b0140be-056d-4e7e-8d2f-ceb5c66437fc',
    '8a49747d-e5fe-4c92-8884-246fd3835f03',
    '9fb81561-5337-4d96-994c-ca4214a3308c',
    '5b0f787a-b5ae-42cc-99db-c1147cbb2453',
    '758e9c79-5187-480a-bcf0-23135c1264d3',
    '9e0b34c1-9198-4ef0-9f2a-7eab3cdfc1dc',
    '4d984d2c-444f-47e9-bbbc-941f18419380',
    '6f39e20c-58ba-47a5-9397-456fbc803b46',
    'c44d1e06-70de-414f-bf04-a88b850bea5d'
  );
COMMIT;
