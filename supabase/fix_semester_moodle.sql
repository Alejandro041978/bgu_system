-- ---------------------------------------------------------------------------
-- Semestre del ERP para las notas heredadas que el campus rellenó.
--
-- EL PROBLEMA
-- 941 filas con source='moodle' no tienen semestre del ERP. No son notas nuevas
-- del campus: son inscripciones heredadas de SystemActiva que la importación de
-- Moodle rellenó con la calificación. Se nota en que traen term_year (el año
-- suelto de Activa) y NO traen term_block, mientras que las que sí tienen
-- semestre traen el bloque con nuestra nomenclatura. Y en que su external_id es
-- el heredado y no el que genera la importación.
--
-- LA REGLA (de Dirección)
-- El semestre sale de la OFERTA del aula. Cuando un aula tiene varias ofertas
-- —se reutilizan entre cohortes—, se toma la PRIMERA que empieza después de la
-- fecha de ingreso del estudiante a ese programa. La fecha de ingreso no se
-- asigna a nada: solo descarta las ofertas anteriores a que el estudiante
-- existiera como tal, que son imposibles.
--
-- El semestre es de la NOTA, no del estudiante: 635 alumnos tienen notas
-- repartidas en varios semestres, así que cada asignatura toma el de su aula.
--
-- POR QUÉ SE PUEDE APLICAR SIN REVISAR FILA A FILA
-- Se contrastó contra una señal independiente: dónde caen las OTRAS notas ya
-- fechadas del mismo estudiante en el mismo programa. De las 233 asignaciones
-- que quedan a más de un año de su ingreso —las únicas dudosas—, 228 tienen con
-- qué contrastarse y en 227 la vecindad confirma la regla. Una sola discrepa, y
-- queda fuera.
--
-- Además no se pisa ningún dato: las 483 están en NULL. Es llenar un hueco, y
-- se deshace vaciándolo.
-- ---------------------------------------------------------------------------

-- PASO 1 · Cuántas hay hoy sin semestre (antes de tocar nada)
select count(*) as sin_semestre
  from academic_grades
 where source = 'moodle' and withdrawn_at is null and semester_id is null;
-- Debe devolver 941.

-- PASO 2 · La asignación, un bloque por semestre
-- El "semester_id is null" de cada update es la red: si algo ya se llenó entre
-- que se generó este archivo y se corre, no se pisa.
-- AY 25-26 SUMMER 2026 · 340 nota(s) · aulas 129, 292, 325, 333, 337, 349, 381, 382, 383, 437, 444, 445, 576, 589, 610, 611, 622, 634, 637, 668
update academic_grades set semester_id = '92d1996e-dcde-4ec5-9049-bbcae76f8781'
 where semester_id is null and external_id in (
   '019bd81b-7701-7c29-87f4-77eba7747064',
   '019bdd76-37be-744e-804e-de8fc89c8f41',
   '019bdd76-3807-7b84-ad1e-f76c2e2e7586',
   '019bdd76-3834-7566-b0d2-60b90352bc57',
   '019be799-b385-7c5f-b3be-a5a0e01ca8b3',
   '019be799-b3c2-7e71-9d6b-0b8c54911a85',
   '019c4d9b-3dc3-70a4-8aa5-25ad9c8d7aac',
   '019c6c94-cc7f-7efc-bcc3-a0ff0f880dad',
   '019c6d98-d905-76ea-a90e-8e563d06a441',
   '019c7264-be65-797d-97bd-ecb80b267d44',
   '019c9189-b5a9-7046-af8e-ce8a64a5627a',
   '019c918e-46e2-7773-9b22-200674e37328',
   '019cfc30-0063-76db-be4c-e3bddeed1b93',
   '019d2c18-8f8e-7994-a4cc-58f6ed7ee491',
   '019d2f98-13da-7166-9efd-1d94170d56a7',
   '034038a8-4a71-4d39-a988-ccba5f3e5d64',
   '0406ac13-3be9-42b1-a43a-e2948e80b46e',
   '058d937c-8cfd-4e31-ab85-61334c11f02e',
   '061d0396-08b1-465f-8ea3-8fe89d9a4019',
   '06cb7ffc-2d24-4896-8585-e821a4e9fbbe',
   '074b7a9a-c80a-40a6-8556-54108a6425a8',
   '08a8cbd3-fe14-4a2e-823f-c5aac26f92dd',
   '08e5d1a1-ef01-43a0-b3c9-97486bb0cecc',
   '099b21fb-c9e7-4258-9cab-147f31fe3a43',
   '09ba2eba-7fd8-4f14-b152-f62f54255643',
   '0a988ef4-f2a7-47ec-b767-23e08001cecc',
   '0c652573-28fe-41ec-ba2a-a691152c2c88',
   '0cc0c332-d44e-44fe-85ba-3ed2f767aa7e',
   '0e8080fa-b875-48b6-a2ee-c663d44850ca',
   '0ea750ee-6dbf-4d87-a709-b8e27464161f',
   '0f95711b-a9ca-4f3e-8109-85efc7a5b168',
   '10bdca6c-2e71-40d4-8850-6fe63030fcf3',
   '11519ef7-0f22-46c4-85e9-4cb5388f5bce',
   '12701a36-ad64-449c-af37-fd18f26810b7',
   '13a6b3a3-86d6-4c8e-82e3-701621ce1323',
   '14dbdce8-29a1-4c06-8c41-eca959cc3296',
   '166c16b5-3f02-4d70-ba72-a13eb8d2f7bb',
   '166e59dc-1a61-455c-b084-93d57c5fce48',
   '17e3c437-4e8e-4609-bf8a-f251047b1079',
   '1856634f-597c-4b72-bda1-4e1ae2bbc321',
   '185c0e4e-b9d4-48cf-9c3c-d979140490cd',
   '19044640-ad9b-4ee2-8d15-e84bf4cb1a4a',
   '194d7685-807d-4d74-809c-8432bf72f613',
   '195ab2dc-31ae-40e2-9053-98841badcbf3',
   '1b819f1f-51d2-4089-9625-2601867377fa',
   '1d278928-6554-4f35-a138-126edc247a1c',
   '1e7a85db-3c88-46c6-a6a9-c3543c1d41b7',
   '1ef35e6a-4501-4729-a13b-4641c59afc1b',
   '1f0689e8-01eb-49b7-a75f-3b1c6557f61e',
   '1f1b732a-7048-46e6-8e31-becb8ac528ed',
   '201340b4-6d15-4c11-b196-4d6d826bf1ae',
   '212437cf-9e99-47e5-9edf-345ed3b79bd8',
   '21dad0fd-2964-44ed-a135-f96163e44a01',
   '233abe49-a94e-4e77-8d17-ad71144c1348',
   '237dbdde-ef4c-437c-8fe5-6b0fa5b081bc',
   '248e7026-c96f-4ee4-805e-17d60806e190',
   '2697e237-72c9-44c5-8898-13a66125476f',
   '278df5c5-ebca-450e-a66b-e2264b6efba6',
   '283440f4-9f26-419b-906a-3d371741ede9',
   '2aa61088-b050-482c-8d61-140993f2d153',
   '2b1f4739-ff19-45d9-98ca-1fa3c4179a30',
   '2bc98ab5-1ec1-4040-800f-1359ab09a6cc',
   '2c7d7ab6-521c-41a3-80ae-e2c5dbf0eb53',
   '2cb06a64-19bf-4bdd-87c5-18d23f9c4a18',
   '2ce49c28-0164-4595-a0e5-69f6379fa35c',
   '2db4cc14-f2be-4cc7-8409-e6e21a6de69c',
   '2e56179f-b262-49ff-ac48-ed3c353e5f88',
   '2ea7709b-c4a0-4b00-8512-adce4255a3e5',
   '2eb45d14-2301-43d5-af36-14d5fc79fca5',
   '30b98950-dcd9-4aee-814a-8dd06c0ab0b3',
   '316be163-b4a4-4e8e-9b5a-18ca012c02c3',
   '31a70d5e-6f57-49af-bcb8-4d779703f046',
   '32878063-a669-4898-95ec-b7ace25c534b',
   '34b8e5aa-0e97-411b-9ea7-807170f14929',
   '34cec14e-dbab-4580-a266-ef84c3e240db',
   '350b8d2f-0728-456b-af73-a756cc79e017',
   '35ac5682-7c64-4a08-a7e9-4909cc83d289',
   '370aeb24-390c-4ec7-9c38-e89e62e4be3d',
   '37642a74-4c67-4aa0-85c8-3a6a39a0640e',
   '3852ef40-3823-42b5-be74-471e1a4f29dc',
   '3b6316f2-20fe-4b87-b0c9-1073e6377a78',
   '3c8e0fef-8db1-4f2d-ade6-63c1d4361a21',
   '3c98afa9-41e9-4f4a-9944-5a1ad5fba163',
   '3db5719f-1a4f-47f9-803b-585684a10574',
   '3eda1ed4-4b53-40ca-bd56-7832df8d6120',
   '3f20ad7a-2a43-4452-8c3a-44109dc984b8',
   '3f507560-b58d-432a-9bd1-a136826d1646',
   '40358433-493c-4cce-ba72-423e2c457b1e',
   '420b9bc8-f6c6-49ef-bc07-dc06ef921231',
   '42e5dfa5-83f7-49fd-8f29-d83be6b50f7c',
   '4334938f-2ec3-4fc3-8123-7484bde5c455',
   '441761fe-ff27-41cd-9d1b-2f75efb24d52',
   '455f7d6a-f005-46e0-9eae-40aad3f7d607',
   '4571daca-72c6-484f-b39a-113854164297',
   '47804921-ec06-43a7-9ba7-1bc466611cf4',
   '478af875-3631-45f4-a165-1a5171f18dc5',
   '4858e4e9-14d0-4cfd-9b68-81a24abfe625',
   '48598668-e34b-414a-96c9-8eaaefe0a4ff',
   '4a629c89-7c3a-4f56-a15a-321c50cb5435',
   '4aa1620d-0a29-4bc1-a666-94e740efe131',
   '4ab6423c-f52e-4dad-afbf-772d42bab0a8',
   '4c5447b2-46d9-4a4f-b5e1-acd7b1e3b495',
   '4d437926-25c3-43d9-b7a7-0fb4401ebf85',
   '4ecedb98-4ec1-49d9-84df-d0a0d046cc9f',
   '4ef22ef9-7251-454f-bda7-43ecdfce143e',
   '4f0689b7-de17-41f0-abd6-87b14e9c49e0',
   '4fc0151c-c91e-40f9-a093-55cbfe22fc4c',
   '4fc5b478-b37b-4e91-9423-cb2f70ff9af4',
   '501560f2-03b3-4c5a-af99-9106519af6fa',
   '520ae8e0-ae07-41bc-a90f-7c7a623d8aec',
   '5290434f-bbad-4c6f-9aa0-d5d287baa0ad',
   '535261e5-e47e-4a99-804a-2d1da691ed82',
   '539684ae-cb2d-4e42-a8f1-2b8e1ca5b394',
   '561cc948-524d-4993-817f-61b2732c23fc',
   '563fc232-4964-41ac-b7bb-69e78cc2446a',
   '56be1d20-51f7-4a91-90f9-7ac0ff301b70',
   '56d830dd-fb85-4daa-bb40-03402b9e5eb4',
   '57a16252-7e1f-4f9c-8c05-fc1269697bd0',
   '57b38f92-7114-4b25-b1bf-1dbe81c10213',
   '58cda73c-b5cf-4b1a-8203-f1ed31b848dd',
   '58e74cae-c52a-40f2-b73b-4d3750740b4b',
   '591cdb6a-47fa-45f7-b9c7-d7e950f2fd1c',
   '59ae5c04-1331-40f4-aa9f-e406f432afea',
   '5a0f79cb-02a3-46e0-9501-b556f423a764',
   '5bb2dfcb-229f-418d-8aa1-070becf85f18',
   '5c16ad4a-d940-4e2f-a9a0-0699419b7110',
   '5c3eebb8-91ec-4d24-843d-4f64fb9e0fb6',
   '5d1eb36a-047e-4306-8648-207ae81cb2ee',
   '5dd296d1-3592-4708-a8f3-673bfe742e03',
   '5f2f2a78-1ff5-4deb-ae1b-21c6797a2b20',
   '5f787149-7d27-4239-a78d-f478df8d52ad',
   '5f83f1c4-b814-4494-8abf-3db349523479',
   '5f843052-635c-4c88-908a-96b485934015',
   '6078965d-6b48-4d39-906b-7196d1949e4f',
   '61584259-971f-4f72-9e5d-be53217932d2',
   '62a96b75-5554-4ad8-a9c3-5fcfb45b14fa',
   '63597539-e332-46ef-b3ba-7b5fdda8ec27',
   '6397f8e1-4aff-4d04-b71a-1ea2515b9983',
   '6473da14-d2ac-406f-b09a-351f69a92381',
   '6598df14-8c08-46de-9452-cb053839285a',
   '65adde66-39bf-478e-a29d-19e1a8361a1b',
   '6731742f-4333-4b84-9db0-6f9d84e1693e',
   '68f794b1-0837-4b38-a2b8-4d510a86bca6',
   '6a767688-29fa-419f-a2ac-8344acb9e17b',
   '6bedb12a-4e48-499e-9935-9074cd4a0e68',
   '6bfaffe9-69b2-4a5d-a3ec-866c4ba66075',
   '6c799385-61c6-42f2-a2c8-c5f702b42be8',
   '6c7c04fa-72dd-4f00-9450-650c81421e84',
   '6ca6bf1b-cf53-476b-a232-1d56b4f08b51',
   '6de29099-7486-4759-94c8-802aebcbf956',
   '6ec0b2ba-e2d9-4284-890c-ef1f20dfeeb5',
   '710b287f-1977-42db-9abc-26a0942287e9',
   '71b34017-aea2-49b6-91c1-98f8bae3d648',
   '72fb2f9f-abe3-4feb-a108-5238e3879468',
   '73979035-d480-41eb-a531-627192beec4c',
   '7436419c-bb40-4997-859a-ce366f349909',
   '74be3b2e-6976-4773-8577-3c1e96faca41',
   '74c68908-8a81-4c96-b036-0207ccc40c7d',
   '781ef942-1aea-4842-8724-b243ad54f8f6',
   '7934c204-9be0-406e-893e-a89a22d4924c',
   '7941e4de-30a1-4fde-8429-6398df3f7682',
   '7b9d78d4-bf08-420e-8599-36df544b11d2',
   '7bf52d22-cc4b-4673-b24f-f9ffa3ce90bc',
   '7c696002-903b-41fd-9d93-10085c5a8773',
   '7d391b2f-e5bb-4333-b394-8c2a4ddbc558',
   '7d6ede5d-1784-4168-a4e1-541e24ce0638',
   '7e98b07a-ccb2-42e0-9deb-5ac629957f59',
   '7fcc6e74-bd5c-4914-b072-d7b6638de243',
   '800377bf-7755-42df-b5e9-43e2442e1abf',
   '803b5649-ebe7-402f-a8ec-2afa874d65ce',
   '817af76f-b520-41b8-9eb1-b966ab2aaaba',
   '8197a4c6-c677-4223-8ada-f617e754de90',
   '83e5371b-3234-4d74-a3a2-40046c8e12d8',
   '8421cbbe-cc8a-4432-b26b-8f4b1a178476',
   '84664fa7-ad59-4883-8410-d7201e673dd8',
   '85035f67-eb7b-4e0b-9c44-3da541d308b0',
   '85a7d3bc-121c-44f7-9681-61ab48aa0d47',
   '861a2c7d-9a38-4a6d-a770-cd62b70c357e',
   '86a919a9-1d64-4666-9b5b-9a107a420ab5',
   '87922ee5-0ef7-4a8e-a50f-9a94b063e6f3',
   '87da0913-96f5-40bb-956a-ca0adb3bd333',
   '882b8fda-4bbe-46ce-8057-ffd258235d55',
   '886127b7-a06e-41f9-a7d8-79761dfa8050',
   '890d624e-579e-471e-9beb-58b3246abc11',
   '89667cf4-c453-49aa-933b-682c567023b1',
   '8966964a-707b-4da5-99a0-8d9a55c8ad80',
   '8a3577f7-ea48-4d7a-8e81-74e24cf0ea25',
   '8a9c24ff-df40-46db-9063-753cf49bb0e6',
   '8f7f2000-d7f4-4ea1-a776-7813522a81db',
   '8ff8a616-2b52-41fc-83f5-656cad03efac',
   '91f4d588-5f46-4ddc-a091-0b82bb411354',
   '930757fa-3d45-489c-a490-22204bd5d929',
   '944b1bd7-5827-4bba-9696-8f34215c832f',
   '95fd2e82-ed96-4814-9bcf-de31a35fc5a1',
   '960d5a0b-e1f6-4a66-b13b-40bb04f87bbf',
   '969aec1d-1b24-4359-a91d-eade17a3c472',
   '96dcc4bf-0ab6-4cf5-abbf-ff4426b9d4b7',
   '96e19697-228e-4f45-9d1b-5b7befe5322b',
   '9757f793-efb6-420d-a225-2eab63b6290b',
   '97673212-5d88-43c9-a87a-0c931314334c',
   '9938c3ea-7218-41f7-9b4b-e67e3f91873d',
   '9986a977-65a8-480a-b901-97359b3c41d6',
   '99b7ebe4-1cee-4a3f-b4cf-0cd03718447f',
   '9b57e46b-d577-473a-bed8-c33b3dd5ca72',
   '9c111ae9-edde-4a23-b219-49d55e9a6242',
   '9c4de891-6e88-4519-9254-c3ebaf4c50c8',
   '9d279daf-e17f-42ca-bf0f-563153447454',
   '9d922dd3-d5db-483b-a68f-a559a162ae32',
   '9d953e61-d37e-40f5-a232-08600019413d',
   '9ef76234-24ec-4ef5-9972-cc375b97f4dc',
   '9f530ad8-4695-4064-a187-e46d47431dcc',
   'a14747ea-339a-4bac-b520-23d75ca13adb',
   'a17ff280-f75f-40ea-87e5-9f86b6e1758b',
   'a215b93e-bc79-4086-bb2f-d8253b3c83cd',
   'a36e01be-6053-4991-a49d-8c792ac76991',
   'a43c027f-8975-4266-a8c7-b587010a8730',
   'a48bb75f-e33b-494d-a146-6b5110d4cfbe',
   'a49766d5-380d-47dc-8674-801d874665ef',
   'a4ba61cb-bfd2-4344-9541-83c6c3ebb63f',
   'a5df28a3-4244-4cae-8813-7c09b80c95a3',
   'a6a83fe6-749a-4b9a-b24d-583ae1468bfa',
   'a6bb2b26-1c44-4892-8967-7ff4f1a8588b',
   'a7da4c4d-ff9d-4c72-a361-67ddba1132e4',
   'a86f40ab-5650-49af-b2cd-31c9dbdb38af',
   'a8b43a38-d218-4952-878c-3681e373a577',
   'a8cdf35b-b070-4cb7-bd6c-798c0ca8b995',
   'a8e096b3-9860-4977-b657-1fbb243b9c13',
   'a8e728c3-eac4-4f56-aa91-681fa650e421',
   'a96bc934-7808-46f4-9b25-3d95241816b4',
   'a9e167e2-49b0-41a6-9d2a-7a15498e3059',
   'aa70add4-c835-4ee7-abe5-78e8438dce6c',
   'aa7d4414-6e00-4a4e-9daa-48d3720294d2',
   'abc5499c-2b04-4d8c-a572-74f9bae7fb0d',
   'acc6ee35-a6c0-4898-b736-e037d9e02dab',
   'ad3e0c50-1a0c-4b25-a285-d5b0c6d9e8a9',
   'ae54b429-1051-4bed-b87d-24b81cbc6e02',
   'ae76ac5d-3ad5-427d-872f-be9caed4085e',
   'ae7c3ca4-dc6a-4f77-a200-931977c92388',
   'ae923bb6-9c8d-4590-ac76-bcee2857876c',
   'af2c1d37-7390-42ed-874d-64ebdca9c225',
   'b13be1d6-f798-483d-bf80-4fdce66a3d46',
   'b161f82c-3461-4944-a064-300b514db313',
   'b70e2f1d-ea51-4b10-9ec6-62b843380c5f',
   'b7bc7f7d-46f0-4fe3-8abd-c84a240d93cc',
   'b88d4c35-191d-4df9-8ca9-8b127bf05b87',
   'ba3d3ca0-2d6c-4cfd-96bf-00911a797bd7',
   'bbe2d807-df62-4750-98a1-567f2b83d25d',
   'bc596e10-434a-4eac-a439-976427202ada',
   'bc68b44f-f47d-44f3-8d35-b8c9d0b07290',
   'bc893bee-1800-4243-bee2-1729738fbc87',
   'bcf0d410-b3d0-4872-87f8-8d9b9a1b1ae0',
   'bd2b60e7-8c22-4540-862f-857ed4a68240',
   'bd7623d1-1461-4737-8b80-12fd488e11b0',
   'bd983411-6905-4b80-8eeb-ea30bdc25f72',
   'c09b7c35-9774-423b-82d6-1f3c9b9bab49',
   'c0d76e9f-70f5-41b7-a4ae-17482d5b759b',
   'c163363b-80ba-4867-9ca2-a75d45ea96fb',
   'c248b604-b24d-4ff9-8a74-23fa8207b1a4',
   'c2eb48b3-e8c2-4f89-a9cb-e2661e2edf10',
   'c3687c61-db32-4b5f-a509-dd4f37c966b8',
   'c444fa4a-225c-4448-8bcd-2e38937e81b7',
   'c479ca1e-93d4-486f-849d-e554af6f6644',
   'c496a7bb-9d7e-4208-b481-9c6315eb4c9c',
   'c4a9a19d-ca8b-425e-8f8b-e1354664a6dc',
   'c4f5a82d-6633-4d68-87b6-fc5c76b864db',
   'c5acec50-e6b9-4371-b01d-339c127c4310',
   'c5c75302-0665-4c74-85b7-2b85ee6fbb19',
   'c6ac8810-a357-42a0-80f1-2f8ea31a2d1c',
   'c74cb966-1002-48b7-b008-1b429b61e6f4',
   'c84f856c-0360-4fa1-b2fd-52315c993649',
   'ca5c9c3f-9978-4782-abc6-dd8db319cab1',
   'cb019913-6db3-45cb-90a3-ea4712c47eab',
   'cbc07dd3-746b-4b76-a9e6-f48dee0d2e63',
   'cdbc55e8-d56b-4f27-9ea6-7636944c49a5',
   'cedda183-994f-4189-a0be-15a91220a528',
   'cf0564a2-b41b-4079-8d02-7e9dce147446',
   'cf0bffca-88fb-4d2b-a74d-dd7521a16bdb',
   'd001d67b-8415-483b-9644-1810921b58fd',
   'd011cea1-c0a3-48a5-93f2-8134e4ca779e',
   'd01564ea-f610-4eb0-bdd1-12080c1283e4',
   'd01eb7c3-8e8b-48b2-935d-d969d56e898f',
   'd0754408-214b-4395-b399-98e2bef7a9bf',
   'd13bd2f8-4c2f-4d51-8a93-4f52b8d6d012',
   'd1635bb6-5881-4adf-b0cc-876705d11a79',
   'd4c86b65-00fc-4d57-aabe-2ebe324cc523',
   'd4efb90f-c5b5-4e5e-8895-0a13cd6280cc',
   'd5135ec2-a8c8-4988-a01c-7687fe9531b9',
   'd6c54227-c661-4ca2-b4fe-e45cbac49198',
   'd6e44990-35a2-49bf-b5ab-61a1c68b3a7d',
   'd7ba9027-03b2-4b5d-8268-61cc5b29d0fa',
   'd8cc4f87-3432-4612-ac4a-16352e5fdc0a',
   'd97f5c09-6c15-4da3-8c9f-0ad42512c939',
   'd9e4392e-bd4e-4a9b-8eb3-33ea099e2336',
   'dad379d1-ba81-4eb2-80a8-61aebf0545c6',
   'db3ac7aa-f786-4e99-82ad-a3392d540d8b',
   'db605cbd-7b67-40db-95d2-307c5384fe20',
   'db9bba0b-9857-4011-bc37-cb8fdc491a20',
   'dc322da9-196c-4bee-80c7-c4dd5a85d29f',
   'dd9f13d3-2c5b-4388-b326-da666fde9215',
   'ddb6a8f3-f576-4bb0-ac0d-a2cd939dbb27',
   'dea70206-caaf-4a1b-bcf9-0b64920338c1',
   'defbe55d-9430-455c-b7d8-5bc3e5ee5ee2',
   'df947d27-f03e-4b63-8593-fda7cbe767fb',
   'dfa19d81-209c-4411-95e1-45a5dbbb78fb',
   'e118acfc-4d7b-427a-a76b-ff85bc29d1b9',
   'e12bdb33-47fa-4467-a7ec-20e0b6d3aa66',
   'e228a05b-1ce5-4b81-bf4d-2bc3d576468b',
   'e3c9c292-9306-4751-af09-0ffa503a3f73',
   'e4194a60-6a0b-4b7d-9f71-804bc0b0a023',
   'e4a3115a-e512-4b23-9fd0-9b70bb1d83a3',
   'e5b1e612-9e87-4597-b6c2-08ab1141ee1a',
   'e671d440-8e6c-4407-8011-4c412fc48559',
   'e6ac51c0-07b8-4a2a-99f9-72edf8681e97',
   'e7558b3a-9e46-4567-93f3-f5bd612d96bc',
   'e8996681-9462-401d-90d2-6779809eea03',
   'e99ab883-81b5-4473-9068-c4d52ce60f5b',
   'e9a2812f-c27c-4bc3-a988-53a8b7c6d929',
   'eabdb9ad-c4fc-4662-9d82-c338541dc7b5',
   'eafaf5d4-9e4b-4788-b06c-704fc73350ea',
   'eba3c667-d9a2-49f6-988a-60bcc8d16607',
   'ec463e5e-1068-44a2-9f18-2f6d2359bb6f',
   'ece58a94-38b1-4d32-9493-459af20836e9',
   'ed1a6ac7-c39c-4bc1-a97f-5671ba244f30',
   'f0f0fffa-e893-4403-b4b8-e3961a82a1fa',
   'f288794d-7a19-4ae5-8344-cbc35f935b10',
   'f34a6f2d-b93d-487b-b409-7e692ab17686',
   'f396d2c2-2070-4585-a95c-c0804b3055ec',
   'f4c2f970-2c4f-4fbd-b919-d5f719bfa1b4',
   'f52fe01f-be58-4f07-99f6-96dc571043b4',
   'f73d8450-050b-4cfc-8bdf-3d73d3bb7641',
   'f78f6173-65e5-4bb4-b8cd-facf77e0bcb3',
   'f92b5969-1eac-4454-8b67-4adf072ec55d',
   'f96ee7d8-0732-426e-857e-e72266b00787',
   'fa9dd772-5a42-47bc-aa4a-11d68aa5bf3d',
   'fc412783-f69b-4b91-bdf8-795cdaad1234',
   'fddbab81-134c-4824-9864-67433e216a2d',
   'fed31d6a-1e71-4d12-aadd-679dd9283d51',
   'ff09ed5b-871d-4e42-9de1-c7fb2f5c0f2a',
   'ff110d82-d4cb-4121-8655-355cba1bcfb5',
   'ff53bcd5-ac8b-4512-8a2d-8b3d866732ef'
 );

-- AY 24-25 FALL 2024 · 37 nota(s) · aulas 131, 134, 135, 254, 299, 300, 305, 307, 442
update academic_grades set semester_id = 'c9d1c866-2e36-43d1-8827-f6c589a8ee67'
 where semester_id is null and external_id in (
   '15bae7bf-2684-4118-a355-01033a9b537b',
   '1d27131c-3fa3-4bcb-a9ec-83d515d994c5',
   '200259b3-54ef-43c5-a456-8107c47d6081',
   '2c1383b5-2b25-4e82-acb5-6ad18e67b97a',
   '2de9adb9-ef01-4ef4-9f38-324ad911eaaf',
   '319d9c79-d138-468d-a299-a36f277f194b',
   '33d6c69d-8c8e-42ca-b094-d11ba7cd11b2',
   '3efc2d0a-511a-44f5-ac96-362640942b87',
   '5067c461-2847-47d3-a5cf-b5dc67361277',
   '5ff3cab0-f9c0-4c7c-a78e-777a53b65595',
   '63f1f8db-a0f2-4a61-a172-d658414b4c66',
   '640512f6-f027-4e13-aa7b-e4b99a4f48e6',
   '65b38253-88d0-411b-b53e-0b18bceb248c',
   '79235dff-df1e-4011-af18-23ee1ba33110',
   '7ad2ccca-606c-4b6f-a131-410753b45f26',
   '8a8d31f7-d61f-411e-add9-db47a024861b',
   '92498f5d-99f9-4d14-a1a5-07a06849bb8d',
   '9c3975c0-116e-4b51-a42d-9ac8e6d418a0',
   'a24cd233-8529-4c4c-aaeb-998da320a63a',
   'a6d91abb-55d4-4f56-a7d4-e1745bb209ab',
   'affb04fd-2399-4c7f-a41b-165c0c5faf01',
   'bc8b4c4d-86df-4eda-a0ff-dc2b676dacdc',
   'befedb67-f6b2-483e-a6cf-9edea5aac028',
   'c27d823d-ebaa-4cd4-b423-64be70842d28',
   'c38d24c2-49df-4082-abbf-a8b3fb0a44bc',
   'c4db0b75-dc01-4f9b-a5f5-1568a83d74bd',
   'c745f008-e223-4a96-a24b-753ef8d4c0ee',
   'd6bd475f-1377-4d67-af8a-e835926f0c6b',
   'd78fe4ca-56b2-47b4-a7bf-3c50112f327c',
   'dd91e7eb-8fa2-4c23-8e46-423d83db5823',
   'dfe9b256-e940-4811-a94f-5f9810bfcb36',
   'e40106b1-9da3-4e7b-a53d-f45fa0a02d2c',
   'eb16b806-75fe-4c79-a385-f1fd819a7b29',
   'f1e2bc02-2537-46d1-a860-7d1db0af1e9b',
   'f80c1bb7-8439-4d7e-a12a-654ce35acfe8',
   'fa1db269-6d59-45ae-aad2-7b896b8fcc66',
   'fc226d6b-a6ef-4323-a417-3ec8a96822e6'
 );

-- AY 24-25 SPRING 2025 · 29 nota(s) · aulas 136, 137, 138, 151, 311, 318, 324, 325, 326, 333, 343
update academic_grades set semester_id = '99eb526b-f6bd-462d-9c77-9f4ba1583603'
 where semester_id is null and external_id in (
   '063416ee-a081-4c62-9b48-111a7d265259',
   '0b30701f-543f-457b-a368-0bdcd7cdcf98',
   '0d14c3aa-97be-41b3-aac8-1da5e2f8f1cc',
   '0d78a0c9-91c2-49e3-afd2-741efa9ddbb0',
   '11d61c47-dc95-44ec-ad49-3292055917a2',
   '1aab0b28-7e82-4566-a5af-b1cf75e22c86',
   '300c416b-dba6-47ed-a401-5c441909131f',
   '46a9cbd5-df27-4f6c-aab3-a4ad68ef1a55',
   '4ebd7c48-3325-4a67-afca-7d7465279be7',
   '4f39a06f-946a-4c0d-b7fd-05894c619209',
   '4f8a11a1-93aa-4614-ab76-e175bd15661a',
   '74844254-5871-4dcf-a4d0-58cba3c9d72d',
   '7cbef042-653c-4096-ad3d-707904524920',
   '82ab1bef-ebc5-49dd-a52e-eb62a269ce98',
   '8ceb9a33-bbce-4613-aec1-4b1cbf92224e',
   '98a7907b-69a4-437a-a270-408b68639a07',
   '98ce0d38-2c06-460a-ad80-1f8eb7db5762',
   'aee97885-b5d1-4abf-ac56-46a11f3f5f4f',
   'b96c7302-2db0-49d0-a4d0-ebefd2396831',
   'be577123-a585-4ff5-a9d8-9d83cda5ce99',
   'c09dff6b-ef1d-45e7-ae0a-a5252e75d854',
   'c244da4a-e956-45f1-a3ce-f8fc54ec607a',
   'cc8e0d6c-a535-4ca9-a335-648573fbbe58',
   'd0f110a4-4058-46df-a1b1-f0fc58511d0b',
   'dbd95a3d-e4e0-4bea-acf4-a589a8d34acb',
   'ddff9ea2-f24e-47df-a786-0402c25c0328',
   'e2b5b3ba-35bd-4609-aad7-4dce00df4aa3',
   'e3307d1e-ece6-497f-a803-9e31db954670',
   'f19673b4-79a7-499e-aeef-eb9785e15c60'
 );

-- AY 24-25 SUMMER 2025 · 24 nota(s) · aulas 292, 348, 349, 350, 363, 371, 408, 434, 442, 445
update academic_grades set semester_id = '26af58a6-a65f-43be-b2ee-08850cf3ec37'
 where semester_id is null and external_id in (
   '06a248ba-0e97-4de0-adce-f903efeba86c',
   '0978a1fd-516b-4921-a52a-8f1456e737ab',
   '1782c005-1755-48f2-afc6-ddbf16ac1ff0',
   '39f25efe-bbb7-4a0e-acca-9be169769058',
   '41c4e2d1-8e99-4e35-a6bd-f8d3212b1864',
   '5c643583-a02d-4ebc-ac1f-3bda5c0b3e1a',
   '5c8f90f4-0299-4332-a6b2-d26d4555cda1',
   '676a20d0-593b-4b99-a01d-0045cd634949',
   '685c63f8-a7e6-45ae-a120-fe68ee80eabc',
   '798abb39-f426-4504-b515-4aa2f138b03c',
   '7f68a553-c9ae-42a3-aa91-37cad00f0ad9',
   '7f9a789f-e254-4426-afef-d5406cf9a900',
   '81a1756b-0e72-4a60-87ba-09b0d9afc68c',
   '93749ba5-9881-446e-ade4-0f7dd11755f0',
   'abced583-f797-4310-aba7-0e0acfb13d95',
   'b495b1bc-b277-4eac-a617-396cb107fbf0',
   'c2d4dd79-b673-4e8f-a939-d1c92c16f9ac',
   'c5fb6617-f9e6-4c0f-ac5b-5ca963fe5f94',
   'c63d5799-a6cb-419c-a4e7-b1503f34d24e',
   'c983db87-1555-4062-ae4a-6e45cc0c5c0f',
   'dfa6a03b-0561-4aad-a275-cc0ea7e26cad',
   'e39d6717-7158-4525-abd9-261d3e82cff6',
   'f0a5edb6-22b2-4f90-9658-503ad3ebe9f7',
   'fc8f4bf7-d171-44c8-bd69-94e73fa2a730'
 );

-- AY 23-24 SUMMER 2024 · 23 nota(s) · aulas 159, 355, 363, 364, 371, 408
update academic_grades set semester_id = 'f486ea73-cb8c-4b7a-ba3f-43c30ebccebe'
 where semester_id is null and external_id in (
   '03157b96-8fa3-41e7-a270-e0d0f6579411',
   '03a52673-e187-48cc-ac46-5b983a481a7a',
   '125e4616-9081-4440-b92b-93f0dd9f115b',
   '12db1055-ecc3-49d3-abd0-e49bed2f70e0',
   '15aaa4ac-a00a-4971-aa24-4946804ef2d6',
   '1cbfec0b-f25b-40a4-a60e-11523e82b721',
   '28e481ce-099f-4e52-ac78-b7a6b17831dd',
   '35416f2b-be8d-493f-a1dd-8d0e95d4b2fb',
   '3e7d3732-2480-4510-8a2e-01b2b4a64f54',
   '5c63ea3f-d144-40ca-a9b8-2b808593dc10',
   '6db0dc5b-497c-444d-a1c2-f62bef03bc18',
   '74c2f713-f3d7-4f24-9b6a-bf14703982a0',
   '85be5a98-2f4f-4752-aa26-745fb911cef1',
   '8c3fc753-f22e-4d8a-af8c-2e9025ae0600',
   '937c3aa0-68a7-49f8-aa15-fe5b08cb915d',
   '98e8dff1-effb-4176-b7d5-63f14bb69f56',
   '9c986d36-3932-42ef-a04c-e6063fe48c4e',
   'ae9305b4-b6b2-4469-abec-9e4e19a3696d',
   'bade6f41-15af-422f-ae5e-a3bd2d616684',
   'cd0911d8-fa1d-4de8-af77-4b1fe6e8356c',
   'd7127c20-6998-4fe0-999b-05b1b0872eb6',
   'f3d77cf4-51c4-4edf-a740-f7c7a652d1b4',
   'f87e86e9-87c9-4195-a4ed-b6ada34b380e'
 );

-- AY 25-26 FALL 2025 · 14 nota(s) · aulas 135, 152, 247, 299, 300, 307, 309
update academic_grades set semester_id = '86fe3d63-6b23-47ed-bdd7-6793b5364296'
 where semester_id is null and external_id in (
   '0f392555-84d5-4512-89a4-f9883cf673c9',
   '28acd2f1-59dd-40c0-a26c-2c1fac190a8f',
   '32abc8d6-3c9f-4049-a07f-9db2783316ae',
   '49db3a42-1346-4ec2-a5a2-16287e1928f4',
   '60e515f7-3451-4e00-a1fa-f72b5146d037',
   '82fd4976-770b-4856-8cef-87266ec4b442',
   '893399dc-c6a9-459d-a5f2-70cd3a677a02',
   'a3ab4bfd-45cd-46e1-a9e6-4de9a0710a80',
   'a765695d-95bb-4980-a68d-da2cf313323d',
   'aee6ec14-12cc-4b88-b875-302f45d71726',
   'b6e0655a-1489-4e30-a9ed-48e169c7f3eb',
   'cb9090e3-5361-48bf-abe4-6c093dee8ce6',
   'd018e54b-2b4d-42e7-b709-f4f4aad8bdf8',
   'faf7cd74-fe2a-4eea-a901-958a3c013373'
 );

-- AY 25-26 SPRING 2026 · 13 nota(s) · aulas 136, 298, 305, 318, 331, 332, 343
update academic_grades set semester_id = '5161ae68-20ef-4fd5-b730-133c2b453823'
 where semester_id is null and external_id in (
   '087bf58e-ab14-4ae9-ad57-deac29c8cc22',
   '25c58146-a7b9-4657-a53f-7006d0f0476e',
   '2a931ccc-9d16-4f4f-a89e-120e74fab0ac',
   '2e4b8704-7836-43ab-a171-955b90baac09',
   '3b158019-610b-4b5a-afc9-da8b040bb499',
   '72b8cc0a-b58b-4c4b-afc3-00b5c74aafc9',
   '75a925b3-96b5-45b2-8056-fcc2240c653c',
   'b836fd0e-8ce1-4bdc-a000-07bf676fdea6',
   'b8f7bcf7-e824-4c2f-a9dd-90d3d6802816',
   'd8c92b90-4982-4040-a445-9f40895a3815',
   'deceaff1-1f44-4d33-a8e0-db810e28f24a',
   'eb7a6fd8-24ed-4721-a860-1499fce41b18',
   'ffe8eae2-f485-4f85-b843-372d4cd29466'
 );

-- AY 26 - 27 FALL 2026 · 3 nota(s) · aulas 350, 366, 437
update academic_grades set semester_id = '78e4ea47-bf10-4eba-ba88-4f5d20901262'
 where semester_id is null and external_id in (
   '019ead0f-6ead-7f13-84c8-300c5b250eb3',
   '2944c63c-c993-4b24-b6ff-b17ba1982a13',
   'bf8e2060-0dc1-49d1-afab-774eeaad8e0d'
 );

-- PASO 3 · Comprobaciones
select count(*) as siguen_sin_semestre
  from academic_grades
 where source = 'moodle' and withdrawn_at is null and semester_id is null;
-- Debe devolver 458: las 41 sin oferta posterior a su ingreso,
-- las 416 de aulas sin ninguna oferta registrada y la 1 que discrepa.

-- Invariante: ninguna nota puede quedar en un semestre que empezó ANTES de que
-- el estudiante ingresara a ese programa.
select count(*) as imposibles
  from academic_grades g
  join academic_students st on st.document_number = g.document_number
  join academic_courses c on c.id = g.course_id
  join academic_student_enrollments e on e.student_id = st.id and e.program_id = c.program_id
  join academic_semesters s on s.id = g.semester_id
 where g.source = 'moodle' and s.start_date < e.enrollment_date::date;
-- Debe devolver 0.

-- ---------------------------------------------------------------------------
-- FUERA DEL LOTE
--
-- a) Discrepa con sus otras notas (1) — que lo mire Académico:
--   Enzo Sebastian Diaz Campos Taxation                   ingresó 2023-07-18 · otras notas 2025-04-28 · regla dice AY 24-25 FALL 2024 · vecindad dice AY 25-26 FALL 2025
--
-- b) 41 notas cuya aula solo tiene ofertas ANTERIORES a su ingreso. O el
--    estudiante entró después de que el aula dejara de ofertarse, o su fecha de
--    ingreso está mal. Hay que mirarlas.
--
-- c) 416 notas de aulas sin NINGUNA oferta registrada. No hay contra qué
--    deducir: Académico tiene que registrar la oferta de esas aulas.
-- ---------------------------------------------------------------------------
