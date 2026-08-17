-- NO CORRER salvo que haya que devolver las cuotas de Jhoel Zelada (75181253)
-- a la matrícula del máster, como estaban antes del 17-08-2026.

UPDATE account_charges SET enrollment_id = '019ef01c-6c67-7fb8-95b6-3d3b3662df28'
 WHERE external_id IN (
  '47d60163-dfdc-4f95-aedf-26583edc16fe',
  '8577b21c-c207-4186-ab14-a0e640f181e5',
  'c64898c5-f854-4e7c-a3d4-cf8010329d7b',
  '60d883d3-7651-4e71-a655-9d4663a6c725',
  'cd4a3fbd-ae53-46c9-9668-8a99d7b3f2d9',
  'b58d4547-02a4-4e43-b1a2-9eed3698e097',
  'aa309e6f-2f2b-47e8-ad09-1215ae8cbc02',
  '1b51fb6d-1ac5-43dd-95c5-30bf868aa559',
  'd6dcb40c-16e3-4e0d-abfd-228117903596',
  '7740b308-1730-45b5-8fcb-66a282f02e17',
  '29962cd1-ab18-4f30-8065-e3b104a6007c',
  'ae1d10ab-63bb-48f2-8b0b-44574c603f55',
  'cea4b7bb-ddb4-4b16-b271-a8813c933dd3',
  'd0412f43-50cc-49f0-b8e5-6e041883ef0c',
  'c2adf70b-d3e1-4f6a-8877-95b9af6c802e',
  'd422a059-9b45-4a1f-80dc-c8075ef6cf49',
  '22ee30e0-00fd-44cc-b137-d8620a9096c9',
  '2ef11209-ff8b-46c2-9987-75eb083e8b7d',
  'd136a281-9f80-434f-86e3-d2c06e5ab8a3',
  'b354883b-ecae-4157-bed0-c9f46d77c5ba'
);
