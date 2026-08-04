-- ===========================================================================
-- Reconstruir la historia de retiros desde la planilla CW/LOA/IW/RE
--
-- Un LOA que no regresa no cambia de naturaleza: el LOA existió, con su fecha
-- y su retorno previsto, y cuando esa fecha pasó nació un hecho NUEVO, el IW.
-- Son dos eventos. La planilla los aplastó en una fila cambiándole la etiqueta
-- al proceso, y a la base llegó solo el segundo.
--
-- El modelo ya lo soportaba: status 'convertido_iw' y converted_to_id existen
-- desde el diseño, y el cron de vencimiento los usa. Lo que faltaba era la
-- historia vieja.
-- ===========================================================================

-- ── 1. Los LOA que faltaban, enlazados al IW que los sucedió ───────────────
insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('5b9d24f5-a186-4895-b650-fb17b17fbbac', 'LOA', '2023-09-22', '2024-02-05', 'convertido_iw', '77c84d2c-dccd-45c7-a8ed-ab8bb7b183ae', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 2');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('eb6781d7-1cb2-4469-b813-675a38272fec', 'LOA', '2023-09-22', '2024-02-05', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 4');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('323e5e6f-4178-4044-9820-b4b285d0dace', 'LOA', '2023-09-22', '2024-01-01', 'convertido_iw', 'd44ec3f4-75c9-4cba-b88a-639f96351a98', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 7');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('0a25a6c4-129d-45e6-9d2c-e2b7c1409e80', 'LOA', '2023-01-19', '2024-03-22', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 10');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('b82b1d3c-dfd1-407e-8e45-eeb01859dd03', 'LOA', '2023-09-22', '2024-02-05', 'convertido_iw', '68b602dc-2484-469e-85c4-e7c9422eba1d', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 12');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('fe9dc29c-eae6-4a8a-8e19-8bdf31c4d4d5', 'LOA', '2023-09-22', '2024-02-05', 'convertido_iw', 'ecd2e498-ef4b-4af4-8d0a-a88490662930', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 13');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('16344a21-c1c2-4bc8-b6a6-6371020531c3', 'LOA', '2023-09-22', '2024-02-05', 'convertido_iw', '475ac9fe-128e-4fe4-8900-4e650a2b74ca', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 14');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('0c654eca-c41e-4ce7-a920-ab70f59704d6', 'LOA', '2023-11-27', '2024-03-22', 'convertido_iw', '602b84ac-4016-41d6-9e99-5aa47c728389', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 15');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('9e6a61a3-935b-4a86-ba44-9ebcf96b51a9', 'LOA', '2023-09-22', '2024-01-29', 'convertido_iw', '456f885a-e505-4339-bbf5-c7263f810df6', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 16');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('82cd1e3f-ba6a-4f42-a9e3-1e2d929e3ed7', 'LOA', '2023-12-19', '2024-04-29', 'convertido_iw', '5fe416a2-db14-4da0-acc6-70325d0d78e8', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 17');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('15558f98-f0f0-47c7-949d-1f956e1969be', 'LOA', '2024-01-29', '2024-06-03', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 21');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('9ad0a3a3-1a08-488b-811f-ef228c10f0c4', 'LOA', '2024-02-21', '2024-06-03', 'convertido_iw', 'c374b533-fd81-4b9b-a320-4b2eac78bd69', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 22');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('08d49b02-cffa-4533-b93e-29553a51179d', 'LOA', '2024-02-18', '2024-09-02', 'convertido_iw', '9d923c65-d140-4b53-8055-cd54cf3654fc', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 25');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('59baed17-a606-44dd-861b-7bb46f21f30f', 'LOA', '2024-04-07', '2024-04-29', 'convertido_iw', '23be02ab-1267-446c-b8e0-80a8311fb217', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 27');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('8460261c-3b97-4a0f-9fb6-6287b33c94b7', 'LOA', '2024-02-09', '2024-07-08', 'convertido_iw', 'faa2d259-0855-46fe-8265-db1774782a4d', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 28');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('6e1199b8-fff3-40b8-b5ea-06d58321ee80', 'LOA', '2024-02-21', '2024-03-11', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 29');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('3d42fdda-8029-4bfa-af09-b1f86143e22e', 'LOA', '2024-02-10', '2024-06-03', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 30');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('2bbca8fb-1700-4b29-aad1-337c3b7ca3c9', 'LOA', '2024-02-21', '2024-04-29', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 33');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('87f007f6-76ab-4ea4-9e65-822ac26a9dff', 'LOA', '2024-04-24', '2024-07-08', 'convertido_iw', 'b066c059-812a-47d1-bd80-343d1e18e881', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 38');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('5d8d781b-3b33-4cd8-99c7-4c8897b712b4', 'LOA', '2024-04-23', '2024-10-07', 'convertido_iw', '907d76ca-18c0-4e44-a248-937879c45692', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 39');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('40449248-81f7-4899-badc-aaabad991978', 'LOA', '2024-04-26', '2024-07-08', 'convertido_iw', '82a2f5e4-d153-49d4-aa8b-f7910409a3d5', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 40');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('704507f3-7591-4522-b72e-306ae22aa14e', 'LOA', '2024-05-02', '2024-10-07', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 41');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('478fe36f-2386-456e-af3a-6dae41f4bc6e', 'LOA', '2024-05-28', '2024-09-02', 'convertido_iw', 'b2170639-99b4-4fbe-9239-c4fe4aa4ede6', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 43');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('5157c29e-7d50-49e7-9cb5-43d346578f97', 'LOA', '2024-06-20', '2024-10-07', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 46');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('bf4c8a36-29fd-46a3-9a57-db105ba5c77d', 'LOA', '2023-07-11', '2024-12-30', 'convertido_iw', '94345fb2-828f-4b20-bd64-7475dc80f89d', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 49');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('0467b5f0-a074-451f-a848-9d62a685d2a3', 'LOA', '2023-12-29', '2024-05-02', 'convertido_iw', '3d2c2080-9272-4a17-9953-506f3bb4a5f3', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 55');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('19042fcd-314d-4978-840a-c5a178d3c9b6', 'LOA', '2024-04-09', '2024-07-01', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 62');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('b9a29c2f-8a77-40f7-b5da-e36d67b21e83', 'LOA', '2024-06-21', '2024-12-04', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 68');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('c9cc428b-5258-44e1-82df-86e4d7269296', 'LOA', '2024-06-27', '2024-07-01', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 70');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('5f2d1222-6008-4cf7-b775-784859d36db8', 'LOA', '2024-07-08', null, 'convertido_iw', '5fba3811-583f-4ef5-a153-cfe2defe306c', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 71');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('6aa58ce9-6712-4caf-ad26-b8c58b748927', 'LOA', '2024-08-07', '2024-10-07', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 76');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('39701071-de90-4be6-b254-0355e68f7f47', 'LOA', '2024-09-10', '2025-02-03', 'convertido_iw', '49e597de-8d75-4c1b-b201-907e5ec34939', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 80');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('e60dd249-6c0f-4dd1-a17e-757dc1427901', 'LOA', '2024-09-24', '2025-03-10', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 89');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('678a9afd-927a-48f3-8bc5-6b626cbcaf64', 'LOA', '2024-10-11', '2025-03-10', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 92');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('d212a74a-fdcf-4bee-8391-bb05b1cece73', 'LOA', '2024-10-16', '2024-11-11', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 93');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('653ab419-3ba3-4853-b721-5f533b3f0b33', 'LOA', '2024-12-12', '2025-03-10', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 107');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('8f81e396-ab31-4923-9df5-6898e731fbce', 'LOA', '2025-01-07', '2025-03-10', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 110');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('4e4119d5-dc02-499f-896f-c05c2d6ee5f0', 'LOA', '2025-01-09', '2025-03-10', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 116');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('bf5c5425-f7e3-4e3e-93f3-cf09ec3f02a8', 'LOA', '2025-01-13', '2025-03-10', 'convertido_iw', '01385dec-5053-46f4-a299-c9ab20b30408', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 121');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('eea4c3a4-2556-4a30-b31e-acbf99d84670', 'LOA', '2025-01-14', '2025-03-10', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 124');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('12285a45-5aeb-4c81-b554-50576fa1bddf', 'LOA', '2025-02-04', '2025-06-02', 'convertido_iw', '4f62c1b9-7ee0-4f78-b9ba-1fd6a1f8aa33', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 129');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('a06910de-fef1-4491-9960-2700f788018a', 'LOA', '2025-02-11', null, 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 136');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('1a94eb44-3f7d-42b3-8453-3865af21f3f3', 'LOA', '2025-03-12', '2025-09-01', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 145');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('95c04f45-c8d0-4d95-8125-a8b6624050b3', 'LOA', '2025-03-12', '2025-07-07', 'convertido_iw', '829baa37-1e96-45da-bcf9-6246a4884994', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 146');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('7b92935e-d53c-4be8-8102-ec4f53bfa779', 'LOA', '2025-03-13', '2025-09-01', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 147');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('91716e6b-c712-442b-907d-2994421ca46f', 'LOA', '2025-03-21', '2025-07-07', 'convertido_iw', 'd88d5268-5cec-4457-8650-59394b453ac1', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 153');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('0d98890d-ec64-443c-bbb4-192676e34630', 'LOA', '2025-04-04', '2025-07-07', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 155');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('bf19e4be-127f-461c-b1cf-e7114ab82719', 'LOA', '2025-04-08', '2025-06-02', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 159');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('ad3ac745-abbb-43ea-9c8d-1925a821110f', 'LOA', '2025-05-05', '2025-09-01', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 167');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('e86ea0b2-8812-4a88-839a-508682e1e2b2', 'LOA', '2025-05-19', '2025-06-02', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 179');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('ca84bfaf-6563-44a2-96b4-be356325d795', 'LOA', '2025-05-21', '2025-10-06', 'convertido_iw', '3d853515-f8ce-45b5-b45e-ee86fe71c5b1', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 180');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('a03d9cc6-70cd-4d5e-8c17-0a032e3b72a3', 'LOA', '2025-06-02', '2025-10-06', 'convertido_iw', 'd4a90de7-df7c-4168-af0e-f9104bbdfa3a', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 181');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('75abd9a5-e538-4e0e-aff5-5b7a23c6c7c1', 'LOA', '2025-06-03', '2025-09-01', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 182');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('a728e1a2-cfb4-4e49-8559-38441aa5e9da', 'LOA', '2025-06-13', '2025-09-01', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 184');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('1d0e25b0-60b0-44a7-9f0c-2f94b638de2e', 'LOA', '2025-06-14', '2025-07-07', 'convertido_iw', '088950e3-7526-4347-81be-6fb61bcaf6de', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 185');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('4d5131f3-bbd1-4896-8a02-861c4770ff8d', 'LOA', '2025-06-17', '2025-10-06', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 189');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('a36436e5-6cd9-4187-9c9d-0d52d6869c20', 'LOA', '2025-06-23', '2025-10-06', 'convertido_iw', '04c0748e-a9c4-4d9d-b0a1-a1b924840744', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 193');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('b295b445-f910-4522-997a-f33f36c01dcb', 'LOA', '2025-06-23', '2025-11-10', 'convertido_iw', 'bf56da5d-7279-4840-9ceb-7c5c32d1f043', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 194');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('abdb60c9-1c3d-4cda-8764-3cb51db1851c', 'LOA', '2025-06-30', '2025-09-08', 'convertido_iw', '36987f43-5fa0-4c89-8332-3abbfae95dc6', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 195');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('23da05af-4aa2-4923-a82b-1034d3b7052f', 'LOA', '2025-07-18', '2025-12-29', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 207');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('92255395-5960-4d7d-b53d-be1ce97e13c2', 'LOA', '2025-07-31', '2025-11-10', 'convertido_iw', '07d85d5d-47b3-4735-8c44-cf49a589345b', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 209');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('c3486d6b-9160-4613-88dc-185419101ad0', 'LOA', '2025-09-03', '2026-01-12', 'convertido_iw', '9b323be2-bcbf-4103-8314-7509788795de', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 217');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('8ff0a1b3-5d40-46cb-b209-08a211799c31', 'LOA', '2025-09-10', '2026-01-05', 'convertido_iw', '49fc3775-dbc8-4316-a1c5-8cfa9eddd475', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 227');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('0ac6157c-bf2b-461e-8fbf-8c0c82e393f7', 'LOA', '2025-09-10', '2025-10-06', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 228');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('5d086d53-f75e-4d15-aabb-9af9d7d7840a', 'LOA', '2025-09-12', '2025-12-29', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 229');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('a3d3f81e-2520-4849-87e8-7739a8740f2d', 'LOA', '2025-09-30', '2025-12-29', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 231');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('427cbc5a-cb85-4908-a36e-62b1902a84be', 'LOA', '2025-10-01', '2025-11-10', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 232');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('087ccf3a-a09f-40c8-a81a-f874c11db63b', 'LOA', '2025-10-02', '2025-11-10', 'convertido_iw', '40a482b0-291f-47dc-9930-bd150461f321', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 233');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('daa171f9-87d8-49a0-9581-03dd884c566b', 'LOA', '2025-10-10', '2025-12-29', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 236');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('64d2ba1f-d930-4e7c-bb6b-0a39e336abd9', 'LOA', '2025-12-15', '2026-04-27', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 254');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('abda0c1e-c4b9-49d8-b9cc-b2ee52f89c9e', 'LOA', '2026-01-12', '2026-02-02', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 263');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('51b179b6-6c8a-4324-9680-5b5d01882768', 'LOA', '2026-01-19', '2026-04-27', 'convertido_iw', 'd66b1259-85ae-4ca8-bad0-052ed8f18ba4', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 266');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('b1becfbd-d027-43dc-aa25-87298865b011', 'LOA', '2026-02-04', '2026-03-09', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 269');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('23a113d6-819b-4319-810a-4080e4eb236a', 'LOA', '2026-02-05', '2026-04-27', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 279');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('758cbaab-d24d-4999-b4c4-ad027a99e96a', 'LOA', '2026-02-05', '2026-06-01', 'convertido_iw', '428dac8d-67fc-45ae-b50e-16e2eb1db498', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 286');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('a13fdea9-65a3-46c7-a1c2-8c3725fea9e5', 'LOA', '2026-02-11', '2026-06-29', 'vigente', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 290');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('66b55c9f-4008-45b1-aedf-541fcfed5907', 'LOA', '2026-03-09', '2026-06-01', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 295');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('500abf1a-9b1a-482e-835c-c833ee99fa1c', 'LOA', '2026-04-14', '2026-04-27', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 307');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('1ae8d125-19d8-4f5c-a655-0e3db2e94b29', 'LOA', '2026-04-15', '2026-07-06', 'convertido_iw', '602e3958-cb2e-49f7-96b6-4c648a79b6f3', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 309');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('dae3b01f-0ea3-498c-b4a2-bedba54b11a5', 'LOA', '2026-04-29', '2026-10-05', 'vigente', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 325');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('3a6ee28f-676b-437f-9a39-a3ee0973fc24', 'LOA', '2026-05-13', '2026-10-05', 'reincorporado', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 330');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('dd1189c9-5753-410a-a2f1-6372ba917dcf', 'LOA', '2026-05-11', '2026-06-01', 'convertido_iw', 'b00264c8-0b62-4cc0-9038-64b259509530', 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 331');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('dbb9b5df-bc2e-457f-a03f-9ef17de2691c', 'LOA', '2026-05-20', '2026-09-07', 'vigente', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 334');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('fbd30bb7-fd38-43b7-8ff6-2f700089b0d7', 'LOA', '2026-05-25', '2026-08-31', 'vigente', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 336');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('914cb49b-f35e-4441-857c-d0f6878b9353', 'LOA', '2026-05-25', '2026-10-05', 'vigente', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 337');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('61564de1-3c7a-4cd5-b1a4-68accfddcc52', 'LOA', '2026-05-25', '2026-08-31', 'vigente', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 339');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('6599936e-ee09-489b-b425-dca9f54cf3f4', 'LOA', '2026-06-02', '2026-08-31', 'vigente', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 342');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('0d98890d-ec64-443c-bbb4-192676e34630', 'LOA', '2026-06-10', '2026-08-31', 'vigente', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 347');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('c9eecd5f-c966-4f05-887e-21652cfb5429', 'LOA', '2026-07-01', '2026-10-05', 'vigente', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 360');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('38f55bc6-988e-4898-950b-fa8afd7fa6fc', 'LOA', '2026-07-01', '2026-10-05', 'vigente', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 361');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('394f3d6c-7780-45bb-9b24-c7ffc10076d7', 'LOA', '2026-07-13', '2026-10-05', 'vigente', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 370');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('7b92935e-d53c-4be8-8102-ec4f53bfa779', 'LOA', '2026-07-24', '2026-11-16', 'vigente', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 373');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('2525006e-7a75-406c-8558-3d3b553e780e', 'LOA', '2026-07-27', '2026-11-02', 'vigente', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 374');

insert into student_withdrawals (student_id, type, withdrawal_date, expires_at, status, converted_to_id, source, note)
 values ('b521e489-9af9-4568-9604-a83d817d3ffa', 'LOA', '2026-07-27', '2026-11-02', 'vigente', null, 'planilla', 'Reconstruido de la planilla CW/LOA/IW/RE · item 375');

-- ── 2. La fecha real del IW ────────────────────────────────────────────────
-- Muchos IW tienen la fecha de la migración de SystemActiva (abril de 2026) y
-- no la del retiro. Se corrigen con la fecha de atención de la planilla, que
-- es cuando Registros efectivamente lo resolvió.
update student_withdrawals set withdrawal_date='2023-09-07' where id='fd464b6c-9246-4cbc-b09a-4dbd123062ba';
update student_withdrawals set withdrawal_date='2023-10-07' where id='d8a2d6ea-16f2-424a-9213-33a46db7e042';
update student_withdrawals set withdrawal_date='2023-11-14' where id='5855d3a7-07d7-4078-a737-979ac79389a2';
update student_withdrawals set withdrawal_date='2023-11-14' where id='6d8f3fd9-6c8d-43ec-b225-5d789d2884db';
update student_withdrawals set withdrawal_date='2023-12-27' where id='708a2fcb-73b4-480a-9362-dfc402fa5c70';
update student_withdrawals set withdrawal_date='2024-01-08' where id='10732ebe-2043-4d3d-beb5-01d958c7442f';
update student_withdrawals set withdrawal_date='2024-02-14' where id='4e241f99-17d0-4e6f-8d04-5076cfea3292';
update student_withdrawals set withdrawal_date='2023-12-13' where id='c52796cc-172c-4ca3-a9f7-3a962575c74f';
update student_withdrawals set withdrawal_date='2024-01-15' where id='dc3fb7d1-de46-4e32-b42e-4bf831a48a25';
update student_withdrawals set withdrawal_date='2024-02-21' where id='771a7f95-4c34-415d-9441-ba49c41ec1fa';
update student_withdrawals set withdrawal_date='2024-02-21' where id='aaf8a5f3-2931-4177-8065-b549c1d049a7';
update student_withdrawals set withdrawal_date='2024-03-29' where id='78e73f2e-2b88-4f91-b7dc-403a604c900a';
update student_withdrawals set withdrawal_date='2024-06-18' where id='49c5a876-9ea6-4621-861a-01e85d1b3733';
update student_withdrawals set withdrawal_date='2024-06-18' where id='fb23a436-c157-481b-a9f7-43177089e95e';
update student_withdrawals set withdrawal_date='2024-06-18' where id='2ffd4034-f99e-4e40-abfe-2128d4d8a433';
update student_withdrawals set withdrawal_date='2024-07-26' where id='de814019-2271-4a0c-adb9-835d363ec675';
update student_withdrawals set withdrawal_date='2023-09-17' where id='e49be49f-177b-4548-b2e1-2506abbe5632';
update student_withdrawals set withdrawal_date='2023-09-17' where id='7e20397c-33d6-43df-b2b3-d834718a4972';
update student_withdrawals set withdrawal_date='2023-09-17' where id='c800d3c3-0145-476d-abfa-e79333ebcdcc';
update student_withdrawals set withdrawal_date='2023-12-04' where id='833350ac-5ac4-4224-90c7-c022ab8500b0';
update student_withdrawals set withdrawal_date='2024-01-14' where id='ff858006-b74a-46b1-9dfc-d8a056b7bcd4';
update student_withdrawals set withdrawal_date='2024-05-28' where id='a782ed27-d416-4009-aa06-ad7fbe9a813f';
update student_withdrawals set withdrawal_date='2024-07-12' where id='b28c40a7-a911-4ba2-a111-8f16df57f0ed';
update student_withdrawals set withdrawal_date='2024-05-07' where id='331d34d1-15f8-4b37-988d-aba9c116cb26';
update student_withdrawals set withdrawal_date='2024-05-12' where id='32ddb4cb-654f-403c-815d-1830917be42d';
update student_withdrawals set withdrawal_date='2024-05-12' where id='340244c7-3a98-4311-9b72-0af7e0115bfb';
update student_withdrawals set withdrawal_date='2024-06-18' where id='0e11d929-a966-4871-b74b-1ed2d28c0b6b';
update student_withdrawals set withdrawal_date='2024-06-09' where id='bca12167-10a4-42d0-8a1e-076ac7c28e01';
update student_withdrawals set withdrawal_date='2024-05-12' where id='71664a05-c610-4d30-a43a-46743d822098';
update student_withdrawals set withdrawal_date='0204-06-09' where id='bee618d5-a5ba-4eb0-a2b9-1a36da27c10d';
update student_withdrawals set withdrawal_date='2024-08-31' where id='46f270bb-4499-4c50-8723-b640c7ff29b5';
update student_withdrawals set withdrawal_date='2024-05-08' where id='c83e2083-7b42-4429-82b1-83528335f7a7';
update student_withdrawals set withdrawal_date='2024-06-05' where id='511cfe01-f50a-4cf5-9a15-bb3acf30dda3';
update student_withdrawals set withdrawal_date='2024-09-02' where id='8898b8f2-b380-49b0-81bc-c1477b9494fd';
update student_withdrawals set withdrawal_date='2024-06-09' where id='08c994b5-a367-4854-92ad-0a238d638500';
update student_withdrawals set withdrawal_date='2024-10-03' where id='893eab81-67ad-48fb-9ce4-54f2211f3dec';
update student_withdrawals set withdrawal_date='2024-12-12' where id='b2029859-8eaf-468d-a920-fd7c4aa12379';
update student_withdrawals set withdrawal_date='2024-08-30' where id='1108e159-d183-4103-a8f0-e7cf470e6493';
update student_withdrawals set withdrawal_date='2024-08-30' where id='cae10702-11a6-46f6-90fc-057225f4480e';
update student_withdrawals set withdrawal_date='2024-10-11' where id='5b63e95a-8e9f-4ecd-b56c-053d2144c815';
update student_withdrawals set withdrawal_date='2024-09-03' where id='d5abaa33-a1df-400f-9818-6c0a8b5bf946';
update student_withdrawals set withdrawal_date='2024-10-07' where id='228a556d-06a3-4712-97d2-e7df9167b46d';
update student_withdrawals set withdrawal_date='2024-12-04' where id='ec1f6e28-10f2-4fbb-9d5f-5f51a43ceb34';
update student_withdrawals set withdrawal_date='2024-11-08' where id='21ab940d-d429-4d98-bc5f-f0ed161d9ba4';
update student_withdrawals set withdrawal_date='2024-10-08' where id='e6f5bd80-b1d5-4991-9d5d-24b4bded3d9b';
update student_withdrawals set withdrawal_date='2024-11-08' where id='a1059ee6-b7b9-4d4d-a60c-ede86127b277';
update student_withdrawals set withdrawal_date='2024-11-20' where id='fabfefdc-bd8b-42b3-9500-61c48fee3593';
update student_withdrawals set withdrawal_date='2025-01-08' where id='4fd5970c-7527-4a48-b09b-df1370b386ae';
update student_withdrawals set withdrawal_date='2025-02-14' where id='cb4e6948-eaf9-4c35-b43e-4245e7f97e40';
update student_withdrawals set withdrawal_date='2025-03-21' where id='32142131-6a9d-400e-bc82-fb1b39806ebb';
update student_withdrawals set withdrawal_date='2025-02-14' where id='5da0cd9a-0027-4607-943d-482ca6ae5de8';
update student_withdrawals set withdrawal_date='2025-02-18' where id='16f9271f-9f33-4b46-b0e6-54378c4449af';
update student_withdrawals set withdrawal_date='2025-02-14' where id='aa9f1316-2544-4b7f-8586-df0460b84315';
update student_withdrawals set withdrawal_date='2025-04-30' where id='83c83dcd-1594-4bd2-a001-fdc543672230';
update student_withdrawals set withdrawal_date='2025-05-08' where id='88da4a8b-21ae-4e0f-b57c-3a846088025b';
update student_withdrawals set withdrawal_date='2025-02-10' where id='4d1cecd5-5234-49a2-82c5-9343a994fc49';
update student_withdrawals set withdrawal_date='2024-06-12' where id='53810736-3e61-4223-b9ed-3a3897edc252';
update student_withdrawals set withdrawal_date='2025-05-09' where id='94cf7d72-d072-47ca-b9b7-dff0a7b272e8';
update student_withdrawals set withdrawal_date='2024-12-06' where id='adf98846-42d9-4741-b45e-795862a7c37e';
update student_withdrawals set withdrawal_date='2025-02-18' where id='da957683-1ed1-4c87-8597-3437df8758b2';
update student_withdrawals set withdrawal_date='2025-05-12' where id='a2a4f7d0-e065-4b1b-b9ef-0d9cc2bcca79';
update student_withdrawals set withdrawal_date='2025-06-18' where id='d09c13fb-5876-43cb-af65-f2f4e3c331c9';
update student_withdrawals set withdrawal_date='2025-01-10' where id='788a0f3e-6453-482e-8078-a546b2ebf557';
update student_withdrawals set withdrawal_date='2025-02-18' where id='9e9c83f4-b526-472b-9f02-3a88c6cc4192';
update student_withdrawals set withdrawal_date='2025-06-18' where id='7509b53a-231f-4620-ba84-839b914eb008';
update student_withdrawals set withdrawal_date='2025-08-11' where id='fa13ec29-5af5-4ed5-a44d-908885a529cf';
update student_withdrawals set withdrawal_date='2025-07-25' where id='29a25d9a-5910-4876-8532-857231bf8ddb';
update student_withdrawals set withdrawal_date='2025-06-19' where id='019335db-a4cd-4765-99ce-026b903577c2';
update student_withdrawals set withdrawal_date='2025-08-18' where id='c05d0e33-e5f7-470c-9470-1aeea7d109ca';
update student_withdrawals set withdrawal_date='2025-07-24' where id='8ccc50d6-34eb-4097-826d-92b2eb552bc7';
update student_withdrawals set withdrawal_date='2025-08-01' where id='a62fdeb5-9d2f-430e-b00f-44ca8c3414a0';
update student_withdrawals set withdrawal_date='2025-11-12' where id='912ef98e-6de2-448c-8221-8c696c919e32';
update student_withdrawals set withdrawal_date='2025-09-05' where id='02914e50-ffb8-42ff-a8ff-28f27b92037d';
update student_withdrawals set withdrawal_date='2025-06-06' where id='15240721-c08e-4cab-9d39-db5636abd5dc';
update student_withdrawals set withdrawal_date='2025-09-03' where id='c9b16d65-4c99-476b-ae5f-3b2f5e2c410b';
update student_withdrawals set withdrawal_date='2025-07-02' where id='8877202c-2bc9-4b2a-b3d1-9564002a6762';
update student_withdrawals set withdrawal_date='2025-12-01' where id='9c3b3589-e5eb-4af9-8b1b-e29a06c8c410';
update student_withdrawals set withdrawal_date='2025-10-07' where id='3d70df0a-e0a8-4b10-8e8d-b8dec4eaa561';
update student_withdrawals set withdrawal_date='2025-11-13' where id='4e970ec3-e9a5-4990-a22b-f18022ef12dc';
update student_withdrawals set withdrawal_date='2025-12-30' where id='5d057cd1-47f1-417b-a06f-312bdcbba70d';
update student_withdrawals set withdrawal_date='2025-11-13' where id='f73025f0-c79f-4988-b266-527911cc9861';
update student_withdrawals set withdrawal_date='2026-02-05' where id='bb8e1360-60ca-4c3e-b483-72df34cae908';
update student_withdrawals set withdrawal_date='2025-12-30' where id='21792208-4949-4b2f-b064-3dafbb81f79a';
update student_withdrawals set withdrawal_date='2026-07-26' where id='893eab81-67ad-48fb-9ce4-54f2211f3dec';
update student_withdrawals set withdrawal_date='2025-01-10' where id='788a0f3e-6453-482e-8078-a546b2ebf557';
update student_withdrawals set withdrawal_date='2026-03-13' where id='293d3165-63f5-4406-97ce-c49985c0d401';
update student_withdrawals set withdrawal_date='2025-12-12' where id='e2c2ed14-afff-48f7-9cc4-c58df4a3d605';
update student_withdrawals set withdrawal_date='2025-12-07' where id='71084884-daaf-4632-b268-f0437425bf78';
update student_withdrawals set withdrawal_date='2026-01-11' where id='b2dde5f8-b77d-4937-b836-056b1b3b4336';
update student_withdrawals set withdrawal_date='2026-04-28' where id='80b6cd05-3193-4f17-9841-e89990475fa2';
update student_withdrawals set withdrawal_date='2025-12-07' where id='79ba0c8d-662e-4ba4-a0da-9645b56d6850';
update student_withdrawals set withdrawal_date='2025-11-13' where id='812666da-c823-45e2-b573-30cfe629a52b';
update student_withdrawals set withdrawal_date='2026-02-05' where id='5b9d9816-a175-4241-a52d-b5e117b07046';
update student_withdrawals set withdrawal_date='2026-02-25' where id='b3df0644-b336-4e82-a2e8-a5e9a58741bf';
update student_withdrawals set withdrawal_date='2025-12-30' where id='c67949e4-0f57-439a-b80b-03431b6f2368';
update student_withdrawals set withdrawal_date='2026-02-25' where id='93ae63d1-28a3-496e-a312-8cb7d1cf79fe';
update student_withdrawals set withdrawal_date='2026-03-16' where id='822f13b1-7f9b-4262-8ba4-4863a7a4a15b';
update student_withdrawals set withdrawal_date='2026-04-16' where id='5f2f408e-80dc-414f-8c64-4e398d6c397a';
update student_withdrawals set withdrawal_date='2026-05-22' where id='a8542347-04f6-4cf7-b54d-e96fbe456d1a';
update student_withdrawals set withdrawal_date='2026-04-16' where id='ac725fef-a712-4280-910f-605dbf7ef32d';
update student_withdrawals set withdrawal_date='2026-05-11' where id='62257017-c897-463a-98da-008dfdddf60b';
update student_withdrawals set withdrawal_date='2026-04-22' where id='b2029859-8eaf-468d-a920-fd7c4aa12379';
update student_withdrawals set withdrawal_date='2026-04-22' where id='2dfe301c-bfd7-4304-89d2-8806360430a8';
update student_withdrawals set withdrawal_date='2026-04-28' where id='7143ff17-1799-4fe1-a18e-0d9938075a8d';
update student_withdrawals set withdrawal_date='2026-04-28' where id='bc8b226b-a618-4302-893e-b9682c3392d7';
update student_withdrawals set withdrawal_date='2026-04-28' where id='50beaa48-6c81-48f1-8a95-15b4fe810c3b';
update student_withdrawals set withdrawal_date='2026-04-28' where id='dcf09d6a-ec1e-4d4d-98ce-6133f99ee7a0';
update student_withdrawals set withdrawal_date='2026-04-28' where id='e59d0333-a54e-4202-ac7e-5c0618aaa30d';
update student_withdrawals set withdrawal_date='2026-04-28' where id='25240fd6-5447-4477-b896-8178e920fba5';
update student_withdrawals set withdrawal_date='2026-04-28' where id='80b6cd05-3193-4f17-9841-e89990475fa2';
update student_withdrawals set withdrawal_date='2026-04-28' where id='b2029859-8eaf-468d-a920-fd7c4aa12379';
update student_withdrawals set withdrawal_date='2026-04-28' where id='d9c73e69-7a35-4dfc-86af-2c5f7be3a78e';
update student_withdrawals set withdrawal_date='2026-04-28' where id='8147e967-03c4-405e-9626-ef531a5305ee';
update student_withdrawals set withdrawal_date='2026-05-12' where id='6efd5813-e647-4d85-b9df-450c9b03cf72';
update student_withdrawals set withdrawal_date='2026-05-27' where id='e6be25ed-d84f-4003-9673-63d320ef2c98';
update student_withdrawals set withdrawal_date='2026-05-08' where id='da96c759-ab20-4573-b87f-eab8324d72de';
update student_withdrawals set withdrawal_date='2026-05-12' where id='bdaf473f-f4dc-4fe3-9d02-26f2c1e4d70b';
update student_withdrawals set withdrawal_date='2026-05-12' where id='69cff52d-af76-445a-bc15-62a5770de9fa';
update student_withdrawals set withdrawal_date='2026-05-12' where id='b3139d56-08ec-4abc-a72e-a25c47f0029f';
update student_withdrawals set withdrawal_date='2026-05-25' where id='019335db-a4cd-4765-99ce-026b903577c2';
update student_withdrawals set withdrawal_date='2026-05-25' where id='88da4a8b-21ae-4e0f-b57c-3a846088025b';
update student_withdrawals set withdrawal_date='2026-05-25' where id='65a32691-9b92-4d24-a593-873f75a548e2';
update student_withdrawals set withdrawal_date='2026-06-05' where id='bdb0979f-4af7-4af7-8759-e191307808ef';
update student_withdrawals set withdrawal_date='2026-06-08' where id='17e58dac-d3f2-47c9-b0a1-8e4b2c144dbd';
update student_withdrawals set withdrawal_date='2026-06-11' where id='708a2fcb-73b4-480a-9362-dfc402fa5c70';
update student_withdrawals set withdrawal_date='2026-06-11' where id='68b602dc-2484-469e-85c4-e7c9422eba1d';
update student_withdrawals set withdrawal_date='2026-06-11' where id='16f9271f-9f33-4b46-b0e6-54378c4449af';
update student_withdrawals set withdrawal_date='2026-06-11' where id='da957683-1ed1-4c87-8597-3437df8758b2';
update student_withdrawals set withdrawal_date='2026-06-11' where id='4835887c-b603-4a00-9220-65a16a360276';
update student_withdrawals set withdrawal_date='2026-06-11' where id='8c5b0532-7e6a-4048-b3d0-fe97120cd67e';
update student_withdrawals set withdrawal_date='2026-06-11' where id='d90be0a2-90d8-4291-b66a-05b198073c1e';
update student_withdrawals set withdrawal_date='2026-06-11' where id='5412e9f9-e833-4a35-8d4c-8c829f844f3e';
update student_withdrawals set withdrawal_date='2026-06-18' where id='4f99fa5a-a60d-42c6-a6ce-6cb16259a546';
update student_withdrawals set withdrawal_date='2026-06-18' where id='d0083f79-0b72-4980-833f-9dfd9694115a';
update student_withdrawals set withdrawal_date='2026-07-07' where id='dded3566-a98a-419f-8d22-405459f932df';
update student_withdrawals set withdrawal_date='2026-07-08' where id='5c003b0a-dfed-48c5-a7ed-1a0e55edafbe';
update student_withdrawals set withdrawal_date='2026-07-13' where id='0ddddca8-4f7c-4430-931f-c718b428c3d5';

-- ── 3. El subtipo, que quedó vacío en los 416 IW ───────────────────────────
-- La planilla distingue IW Administrativo (lo decide la institución) de IW
-- Voluntario (lo pide el estudiante). Son cosas distintas para retención.
update student_withdrawals set subtype='administrativo' where id='fd464b6c-9246-4cbc-b09a-4dbd123062ba';
update student_withdrawals set subtype='administrativo' where id='d8a2d6ea-16f2-424a-9213-33a46db7e042';
update student_withdrawals set subtype='administrativo' where id='5855d3a7-07d7-4078-a737-979ac79389a2';
update student_withdrawals set subtype='administrativo' where id='6d8f3fd9-6c8d-43ec-b225-5d789d2884db';
update student_withdrawals set subtype='administrativo' where id='32925f5e-bfb6-4b40-8e54-b3ee3453ef94';
update student_withdrawals set subtype='administrativo' where id='708a2fcb-73b4-480a-9362-dfc402fa5c70';
update student_withdrawals set subtype='administrativo' where id='a79b05bf-3bb0-4e72-b053-423e499113d8';
update student_withdrawals set subtype='administrativo' where id='8898b8f2-b380-49b0-81bc-c1477b9494fd';
update student_withdrawals set subtype='administrativo' where id='1c37370e-7843-4219-a07f-55711f53166f';
update student_withdrawals set subtype='administrativo' where id='d3e75e86-02f4-401a-9753-e027803256f5';
update student_withdrawals set subtype='administrativo' where id='eb462898-71b2-4ebe-956e-eecab3abcc08';
update student_withdrawals set subtype='administrativo' where id='a05d728a-9783-4fe3-bed5-e493ba3fa32f';
update student_withdrawals set subtype='administrativo' where id='10732ebe-2043-4d3d-beb5-01d958c7442f';
update student_withdrawals set subtype='administrativo' where id='4e241f99-17d0-4e6f-8d04-5076cfea3292';
update student_withdrawals set subtype='administrativo' where id='c52796cc-172c-4ca3-a9f7-3a962575c74f';
update student_withdrawals set subtype='administrativo' where id='dc3fb7d1-de46-4e32-b42e-4bf831a48a25';
update student_withdrawals set subtype='administrativo' where id='771a7f95-4c34-415d-9441-ba49c41ec1fa';
update student_withdrawals set subtype='administrativo' where id='bee43ef0-988f-4e55-a0c5-be718279be56';
update student_withdrawals set subtype='administrativo' where id='aaf8a5f3-2931-4177-8065-b549c1d049a7';
update student_withdrawals set subtype='administrativo' where id='78e73f2e-2b88-4f91-b7dc-403a604c900a';
update student_withdrawals set subtype='administrativo' where id='49c5a876-9ea6-4621-861a-01e85d1b3733';
update student_withdrawals set subtype='administrativo' where id='fb23a436-c157-481b-a9f7-43177089e95e';
update student_withdrawals set subtype='administrativo' where id='2ffd4034-f99e-4e40-abfe-2128d4d8a433';
update student_withdrawals set subtype='administrativo' where id='de814019-2271-4a0c-adb9-835d363ec675';
update student_withdrawals set subtype='administrativo' where id='dc7d4672-a977-4e59-9378-a3eca2ec590b';
update student_withdrawals set subtype='administrativo' where id='e49be49f-177b-4548-b2e1-2506abbe5632';
update student_withdrawals set subtype='administrativo' where id='7e20397c-33d6-43df-b2b3-d834718a4972';
update student_withdrawals set subtype='administrativo' where id='c800d3c3-0145-476d-abfa-e79333ebcdcc';
update student_withdrawals set subtype='administrativo' where id='833350ac-5ac4-4224-90c7-c022ab8500b0';
update student_withdrawals set subtype='administrativo' where id='157a8c87-6b1d-4dc8-9140-6b747635d3ea';
update student_withdrawals set subtype='administrativo' where id='ff858006-b74a-46b1-9dfc-d8a056b7bcd4';
update student_withdrawals set subtype='administrativo' where id='f4b807e6-d4df-4940-b910-69ea59ab94e3';
update student_withdrawals set subtype='voluntario' where id='a782ed27-d416-4009-aa06-ad7fbe9a813f';
update student_withdrawals set subtype='administrativo' where id='b28c40a7-a911-4ba2-a111-8f16df57f0ed';
update student_withdrawals set subtype='administrativo' where id='985252fa-871a-43a8-9532-bfa0edb39f15';
update student_withdrawals set subtype='administrativo' where id='67c7fb35-b888-428d-8131-f0584f2b503a';
update student_withdrawals set subtype='administrativo' where id='331d34d1-15f8-4b37-988d-aba9c116cb26';
update student_withdrawals set subtype='administrativo' where id='32ddb4cb-654f-403c-815d-1830917be42d';
update student_withdrawals set subtype='administrativo' where id='340244c7-3a98-4311-9b72-0af7e0115bfb';
update student_withdrawals set subtype='administrativo' where id='0e11d929-a966-4871-b74b-1ed2d28c0b6b';
update student_withdrawals set subtype='administrativo' where id='bca12167-10a4-42d0-8a1e-076ac7c28e01';
update student_withdrawals set subtype='administrativo' where id='71664a05-c610-4d30-a43a-46743d822098';
update student_withdrawals set subtype='administrativo' where id='bee618d5-a5ba-4eb0-a2b9-1a36da27c10d';
update student_withdrawals set subtype='administrativo' where id='46f270bb-4499-4c50-8723-b640c7ff29b5';
update student_withdrawals set subtype='administrativo' where id='c83e2083-7b42-4429-82b1-83528335f7a7';
update student_withdrawals set subtype='administrativo' where id='511cfe01-f50a-4cf5-9a15-bb3acf30dda3';
update student_withdrawals set subtype='administrativo' where id='fbffb629-25c5-4c82-9490-0b4c472c8ee1';
update student_withdrawals set subtype='administrativo' where id='8898b8f2-b380-49b0-81bc-c1477b9494fd';
update student_withdrawals set subtype='administrativo' where id='08c994b5-a367-4854-92ad-0a238d638500';
update student_withdrawals set subtype='administrativo' where id='41a78a30-af5d-4f2f-8101-544cc58e9cb0';
update student_withdrawals set subtype='administrativo' where id='893eab81-67ad-48fb-9ce4-54f2211f3dec';
update student_withdrawals set subtype='administrativo' where id='b2029859-8eaf-468d-a920-fd7c4aa12379';
update student_withdrawals set subtype='administrativo' where id='b9c51dc0-4bf1-4e22-9c86-8233b1516df3';
update student_withdrawals set subtype='administrativo' where id='1108e159-d183-4103-a8f0-e7cf470e6493';
update student_withdrawals set subtype='administrativo' where id='e3267ca2-b11f-4974-809f-d5b07daa4c95';
update student_withdrawals set subtype='administrativo' where id='cae10702-11a6-46f6-90fc-057225f4480e';
update student_withdrawals set subtype='administrativo' where id='b1b21773-8f1b-4aa1-a22d-8c8b61469f88';
update student_withdrawals set subtype='administrativo' where id='8ac7cd14-ce4d-46e7-81af-61bba225d83a';
update student_withdrawals set subtype='administrativo' where id='5b63e95a-8e9f-4ecd-b56c-053d2144c815';
update student_withdrawals set subtype='administrativo' where id='80f239d6-6196-4b04-aded-d400d8b35184';
update student_withdrawals set subtype='administrativo' where id='d5abaa33-a1df-400f-9818-6c0a8b5bf946';
update student_withdrawals set subtype='administrativo' where id='ef9cedba-de59-4758-a5bb-e174d594d562';
update student_withdrawals set subtype='administrativo' where id='8a9403e3-0172-42e7-93ae-31d820b111ed';
update student_withdrawals set subtype='administrativo' where id='2e8ad2fa-8844-481e-98be-a8bdb2f41f23';
update student_withdrawals set subtype='administrativo' where id='f3002eda-7d49-4d61-88ac-d102d8334380';
update student_withdrawals set subtype='administrativo' where id='6aa603bd-26a7-4446-a43b-ec7d7e3f3684';
update student_withdrawals set subtype='administrativo' where id='0fd91af1-797d-4554-b5fb-ea12ccf728d9';
update student_withdrawals set subtype='administrativo' where id='4f8711d5-f664-4866-9da8-a1f82bd6cfd4';
update student_withdrawals set subtype='administrativo' where id='d0e00685-4499-49d5-8975-99bb3b0d50d3';
update student_withdrawals set subtype='administrativo' where id='228a556d-06a3-4712-97d2-e7df9167b46d';
update student_withdrawals set subtype='administrativo' where id='ec1f6e28-10f2-4fbb-9d5f-5f51a43ceb34';
update student_withdrawals set subtype='administrativo' where id='2cdcb88e-955d-44ad-8bb3-82450c1190cf';
update student_withdrawals set subtype='administrativo' where id='4e66c56f-bb44-4d0e-b6ec-e092a854af27';
update student_withdrawals set subtype='administrativo' where id='9d0b3bfe-739b-4e6c-8c1d-91ea56e2ca88';
update student_withdrawals set subtype='administrativo' where id='46f270bb-4499-4c50-8723-b640c7ff29b5';
update student_withdrawals set subtype='voluntario' where id='1b13cbb9-5ec1-4ebc-aaf1-278f0f91bec8';
update student_withdrawals set subtype='administrativo' where id='eb4ea30e-5878-4f30-b5e4-603c48325ae5';
update student_withdrawals set subtype='administrativo' where id='09b00314-a564-4c1c-a982-9f3fd535c184';
update student_withdrawals set subtype='administrativo' where id='7ca12f5c-3686-45a1-8e0f-69e87ee6a0ac';
update student_withdrawals set subtype='administrativo' where id='21ab940d-d429-4d98-bc5f-f0ed161d9ba4';
update student_withdrawals set subtype='administrativo' where id='e6f5bd80-b1d5-4991-9d5d-24b4bded3d9b';
update student_withdrawals set subtype='administrativo' where id='a1059ee6-b7b9-4d4d-a60c-ede86127b277';
update student_withdrawals set subtype='administrativo' where id='fabfefdc-bd8b-42b3-9500-61c48fee3593';
update student_withdrawals set subtype='administrativo' where id='e513839a-c18c-4c86-854e-7f5c3bcde6fe';
update student_withdrawals set subtype='administrativo' where id='4fd5970c-7527-4a48-b09b-df1370b386ae';
update student_withdrawals set subtype='administrativo' where id='8573dd78-690b-4e03-bdce-803c2ff9f636';
update student_withdrawals set subtype='administrativo' where id='8d7f01b9-014a-4312-b7ce-fd1e2836188e';
update student_withdrawals set subtype='administrativo' where id='cb4e6948-eaf9-4c35-b43e-4245e7f97e40';
update student_withdrawals set subtype='administrativo' where id='1da19a48-ea1d-4315-a526-18a62ba373a3';
update student_withdrawals set subtype='voluntario' where id='32142131-6a9d-400e-bc82-fb1b39806ebb';
update student_withdrawals set subtype='voluntario' where id='94939ebf-bda4-4747-991b-845aed9b3cd5';
update student_withdrawals set subtype='administrativo' where id='5da0cd9a-0027-4607-943d-482ca6ae5de8';
update student_withdrawals set subtype='administrativo' where id='e2591457-f167-449f-89bd-d7b6d2f5886d';
update student_withdrawals set subtype='administrativo' where id='16f9271f-9f33-4b46-b0e6-54378c4449af';
update student_withdrawals set subtype='administrativo' where id='aa9f1316-2544-4b7f-8586-df0460b84315';
update student_withdrawals set subtype='administrativo' where id='83c83dcd-1594-4bd2-a001-fdc543672230';
update student_withdrawals set subtype='voluntario' where id='fe82200e-6d38-424f-a6b1-37be58e2476f';
update student_withdrawals set subtype='administrativo' where id='88da4a8b-21ae-4e0f-b57c-3a846088025b';
update student_withdrawals set subtype='administrativo' where id='51e6f37b-0af7-491a-a2ed-478fc9b977a6';
update student_withdrawals set subtype='administrativo' where id='1c37370e-7843-4219-a07f-55711f53166f';
update student_withdrawals set subtype='administrativo' where id='4d1cecd5-5234-49a2-82c5-9343a994fc49';
update student_withdrawals set subtype='administrativo' where id='fa76b447-1082-49ab-a095-40bb04ad7853';
update student_withdrawals set subtype='administrativo' where id='b14f6312-709c-4d8a-b457-c802f6014dbc';
update student_withdrawals set subtype='administrativo' where id='53810736-3e61-4223-b9ed-3a3897edc252';
update student_withdrawals set subtype='administrativo' where id='94cf7d72-d072-47ca-b9b7-dff0a7b272e8';
update student_withdrawals set subtype='administrativo' where id='3b140cd7-57d9-47ef-85c8-ab832b440344';
update student_withdrawals set subtype='administrativo' where id='adf98846-42d9-4741-b45e-795862a7c37e';
update student_withdrawals set subtype='administrativo' where id='e8127d35-a31c-4d25-9659-9590adfd20ba';
update student_withdrawals set subtype='administrativo' where id='17e58dac-d3f2-47c9-b0a1-8e4b2c144dbd';
update student_withdrawals set subtype='administrativo' where id='602e3958-cb2e-49f7-96b6-4c648a79b6f3';
update student_withdrawals set subtype='administrativo' where id='da957683-1ed1-4c87-8597-3437df8758b2';
update student_withdrawals set subtype='administrativo' where id='a2a4f7d0-e065-4b1b-b9ef-0d9cc2bcca79';
update student_withdrawals set subtype='administrativo' where id='f7036bbc-4fb0-489d-b18f-fec14e4c68d4';
update student_withdrawals set subtype='administrativo' where id='9a4a8a33-3eda-470d-aa13-becd5215b1aa';
update student_withdrawals set subtype='administrativo' where id='d90be0a2-90d8-4291-b66a-05b198073c1e';
update student_withdrawals set subtype='administrativo' where id='af2dd518-51a2-41aa-9289-a8740d198f8c';
update student_withdrawals set subtype='administrativo' where id='5fe3f891-0547-418f-a5ad-ae6494a24e4d';
update student_withdrawals set subtype='administrativo' where id='d09c13fb-5876-43cb-af65-f2f4e3c331c9';
update student_withdrawals set subtype='administrativo' where id='788a0f3e-6453-482e-8078-a546b2ebf557';
update student_withdrawals set subtype='administrativo' where id='9e9c83f4-b526-472b-9f02-3a88c6cc4192';
update student_withdrawals set subtype='administrativo' where id='7509b53a-231f-4620-ba84-839b914eb008';
update student_withdrawals set subtype='voluntario' where id='fa13ec29-5af5-4ed5-a44d-908885a529cf';
update student_withdrawals set subtype='administrativo' where id='29a25d9a-5910-4876-8532-857231bf8ddb';
update student_withdrawals set subtype='administrativo' where id='fcc7ee29-fd1a-45a7-a00c-5c8f3dd54e84';
update student_withdrawals set subtype='administrativo' where id='019335db-a4cd-4765-99ce-026b903577c2';
update student_withdrawals set subtype='voluntario' where id='b27cbaa0-1d22-4a3b-837e-12454462eea0';
update student_withdrawals set subtype='voluntario' where id='c05d0e33-e5f7-470c-9470-1aeea7d109ca';
update student_withdrawals set subtype='administrativo' where id='8ccc50d6-34eb-4097-826d-92b2eb552bc7';
update student_withdrawals set subtype='administrativo' where id='a62fdeb5-9d2f-430e-b00f-44ca8c3414a0';
update student_withdrawals set subtype='administrativo' where id='2c7f26b2-b4bb-468d-ba25-62e1a5c1652f';
update student_withdrawals set subtype='administrativo' where id='84b00ef2-fc56-4e9a-957b-9fb4e6539a91';
update student_withdrawals set subtype='administrativo' where id='912ef98e-6de2-448c-8221-8c696c919e32';
update student_withdrawals set subtype='administrativo' where id='e490744a-a172-4a70-a274-09159c210e30';
update student_withdrawals set subtype='administrativo' where id='02914e50-ffb8-42ff-a8ff-28f27b92037d';
update student_withdrawals set subtype='administrativo' where id='15240721-c08e-4cab-9d39-db5636abd5dc';
update student_withdrawals set subtype='administrativo' where id='68b602dc-2484-469e-85c4-e7c9422eba1d';
update student_withdrawals set subtype='administrativo' where id='c9b16d65-4c99-476b-ae5f-3b2f5e2c410b';
update student_withdrawals set subtype='administrativo' where id='8877202c-2bc9-4b2a-b3d1-9564002a6762';
update student_withdrawals set subtype='administrativo' where id='fa60b453-6764-4307-aba9-a0a0f4c2b69c';
update student_withdrawals set subtype='voluntario' where id='9c3b3589-e5eb-4af9-8b1b-e29a06c8c410';
update student_withdrawals set subtype='administrativo' where id='3d70df0a-e0a8-4b10-8e8d-b8dec4eaa561';
update student_withdrawals set subtype='voluntario' where id='9d0b3bfe-739b-4e6c-8c1d-91ea56e2ca88';
update student_withdrawals set subtype='administrativo' where id='c3ae1c07-7a9f-46c6-b701-e7766e52c66e';
update student_withdrawals set subtype='administrativo' where id='53810736-3e61-4223-b9ed-3a3897edc252';
update student_withdrawals set subtype='administrativo' where id='4e970ec3-e9a5-4990-a22b-f18022ef12dc';
update student_withdrawals set subtype='administrativo' where id='5d057cd1-47f1-417b-a06f-312bdcbba70d';
update student_withdrawals set subtype='administrativo' where id='f73025f0-c79f-4988-b266-527911cc9861';
update student_withdrawals set subtype='administrativo' where id='bb8e1360-60ca-4c3e-b483-72df34cae908';
update student_withdrawals set subtype='administrativo' where id='21792208-4949-4b2f-b064-3dafbb81f79a';
update student_withdrawals set subtype='administrativo' where id='893eab81-67ad-48fb-9ce4-54f2211f3dec';
update student_withdrawals set subtype='administrativo' where id='788a0f3e-6453-482e-8078-a546b2ebf557';
update student_withdrawals set subtype='administrativo' where id='293d3165-63f5-4406-97ce-c49985c0d401';
update student_withdrawals set subtype='administrativo' where id='e2c2ed14-afff-48f7-9cc4-c58df4a3d605';
update student_withdrawals set subtype='administrativo' where id='71084884-daaf-4632-b268-f0437425bf78';
update student_withdrawals set subtype='administrativo' where id='b2dde5f8-b77d-4937-b836-056b1b3b4336';
update student_withdrawals set subtype='administrativo' where id='80b6cd05-3193-4f17-9841-e89990475fa2';
update student_withdrawals set subtype='administrativo' where id='79ba0c8d-662e-4ba4-a0da-9645b56d6850';
update student_withdrawals set subtype='administrativo' where id='b241af8a-2ba6-4c9e-926d-db68190e198e';
update student_withdrawals set subtype='administrativo' where id='812666da-c823-45e2-b573-30cfe629a52b';
update student_withdrawals set subtype='administrativo' where id='5b9d9816-a175-4241-a52d-b5e117b07046';
update student_withdrawals set subtype='voluntario' where id='b3df0644-b336-4e82-a2e8-a5e9a58741bf';
update student_withdrawals set subtype='administrativo' where id='c67949e4-0f57-439a-b80b-03431b6f2368';
update student_withdrawals set subtype='administrativo' where id='cadfefce-d53b-4f4f-a0db-3bfab1025b67';
update student_withdrawals set subtype='administrativo' where id='795614a6-173d-421c-9da4-63a296567078';
update student_withdrawals set subtype='administrativo' where id='b0d8be88-ffeb-4bd4-8089-3484baa386f6';
update student_withdrawals set subtype='administrativo' where id='0fad843a-5fd9-478b-bab1-46ec2dffc4cf';
update student_withdrawals set subtype='administrativo' where id='d49979ac-302f-4df8-97e2-227342271908';
update student_withdrawals set subtype='voluntario' where id='93ae63d1-28a3-496e-a312-8cb7d1cf79fe';
update student_withdrawals set subtype='voluntario' where id='822f13b1-7f9b-4262-8ba4-4863a7a4a15b';
update student_withdrawals set subtype='administrativo' where id='5f2f408e-80dc-414f-8c64-4e398d6c397a';
update student_withdrawals set subtype='administrativo' where id='a8542347-04f6-4cf7-b54d-e96fbe456d1a';
update student_withdrawals set subtype='voluntario' where id='ac725fef-a712-4280-910f-605dbf7ef32d';
update student_withdrawals set subtype='voluntario' where id='62257017-c897-463a-98da-008dfdddf60b';
update student_withdrawals set subtype='administrativo' where id='b2029859-8eaf-468d-a920-fd7c4aa12379';
update student_withdrawals set subtype='administrativo' where id='2dfe301c-bfd7-4304-89d2-8806360430a8';
update student_withdrawals set subtype='voluntario' where id='7143ff17-1799-4fe1-a18e-0d9938075a8d';
update student_withdrawals set subtype='administrativo' where id='bc8b226b-a618-4302-893e-b9682c3392d7';
update student_withdrawals set subtype='administrativo' where id='50beaa48-6c81-48f1-8a95-15b4fe810c3b';
update student_withdrawals set subtype='administrativo' where id='dcf09d6a-ec1e-4d4d-98ce-6133f99ee7a0';
update student_withdrawals set subtype='administrativo' where id='e59d0333-a54e-4202-ac7e-5c0618aaa30d';
update student_withdrawals set subtype='administrativo' where id='25240fd6-5447-4477-b896-8178e920fba5';
update student_withdrawals set subtype='administrativo' where id='80b6cd05-3193-4f17-9841-e89990475fa2';
update student_withdrawals set subtype='administrativo' where id='b2029859-8eaf-468d-a920-fd7c4aa12379';
update student_withdrawals set subtype='administrativo' where id='d9c73e69-7a35-4dfc-86af-2c5f7be3a78e';
update student_withdrawals set subtype='administrativo' where id='8147e967-03c4-405e-9626-ef531a5305ee';
update student_withdrawals set subtype='voluntario' where id='6efd5813-e647-4d85-b9df-450c9b03cf72';
update student_withdrawals set subtype='administrativo' where id='e6be25ed-d84f-4003-9673-63d320ef2c98';
update student_withdrawals set subtype='voluntario' where id='da96c759-ab20-4573-b87f-eab8324d72de';
update student_withdrawals set subtype='administrativo' where id='bdaf473f-f4dc-4fe3-9d02-26f2c1e4d70b';
update student_withdrawals set subtype='administrativo' where id='bdb0979f-4af7-4af7-8759-e191307808ef';
update student_withdrawals set subtype='administrativo' where id='69cff52d-af76-445a-bc15-62a5770de9fa';
update student_withdrawals set subtype='administrativo' where id='b3139d56-08ec-4abc-a72e-a25c47f0029f';
update student_withdrawals set subtype='voluntario' where id='5fbc4ccb-cb3a-476d-bca2-323093706606';
update student_withdrawals set subtype='administrativo' where id='019335db-a4cd-4765-99ce-026b903577c2';
update student_withdrawals set subtype='administrativo' where id='88da4a8b-21ae-4e0f-b57c-3a846088025b';
update student_withdrawals set subtype='voluntario' where id='65a32691-9b92-4d24-a593-873f75a548e2';
update student_withdrawals set subtype='administrativo' where id='bdb0979f-4af7-4af7-8759-e191307808ef';
update student_withdrawals set subtype='administrativo' where id='17e58dac-d3f2-47c9-b0a1-8e4b2c144dbd';
update student_withdrawals set subtype='administrativo' where id='428dac8d-67fc-45ae-b50e-16e2eb1db498';
update student_withdrawals set subtype='administrativo' where id='708a2fcb-73b4-480a-9362-dfc402fa5c70';
update student_withdrawals set subtype='administrativo' where id='68b602dc-2484-469e-85c4-e7c9422eba1d';
update student_withdrawals set subtype='administrativo' where id='16f9271f-9f33-4b46-b0e6-54378c4449af';
update student_withdrawals set subtype='administrativo' where id='da957683-1ed1-4c87-8597-3437df8758b2';
update student_withdrawals set subtype='administrativo' where id='4835887c-b603-4a00-9220-65a16a360276';
update student_withdrawals set subtype='administrativo' where id='8c5b0532-7e6a-4048-b3d0-fe97120cd67e';
update student_withdrawals set subtype='administrativo' where id='d90be0a2-90d8-4291-b66a-05b198073c1e';
update student_withdrawals set subtype='administrativo' where id='5412e9f9-e833-4a35-8d4c-8c829f844f3e';
update student_withdrawals set subtype='administrativo' where id='4f99fa5a-a60d-42c6-a6ce-6cb16259a546';
update student_withdrawals set subtype='administrativo' where id='d0083f79-0b72-4980-833f-9dfd9694115a';
update student_withdrawals set subtype='administrativo' where id='dded3566-a98a-419f-8d22-405459f932df';
update student_withdrawals set subtype='voluntario' where id='5c003b0a-dfed-48c5-a7ed-1a0e55edafbe';
update student_withdrawals set subtype='administrativo' where id='0ddddca8-4f7c-4430-931f-c718b428c3d5';
update student_withdrawals set subtype='administrativo' where id='46fcea6b-d9cb-4ee0-be5c-2e007c198cb5';
update student_withdrawals set subtype='administrativo' where id='8e77d4e2-ba64-4c52-ba3c-e658bf6842fb';

-- ── Verificación ──────────────────────────────────────────────────────────
select type, status, count(*)::text as n from student_withdrawals group by 1,2 order by 1,2;
select coalesce(subtype,'(sin subtipo)') as subtipo, count(*)::text as n
  from student_withdrawals where type='IW' group by 1;
select count(*)::text as "IW con fecha de migracion (abr-2026)"
  from student_withdrawals where type='IW' and withdrawal_date between '2026-04-01' and '2026-04-30';
