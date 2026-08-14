-- ---------------------------------------------------------------------------
-- Semestre por TEMPORADA DEL AULA + AÑO DE INGRESO del estudiante.
--
-- LA REGLA (de Dirección)
-- Un aula se dicta siempre en la misma temporada: la 126 es de verano, la 633
-- de otoño. Así que el semestre de una nota es el de ESA temporada en el año en
-- que el estudiante ingresó. En el aula 126 se lee solo:
--
--     ingresaron en 2023 →  3 notas  →  SUMMER 2023
--     ingresaron en 2024 →  2 notas  →  SUMMER 2024
--     ingresaron en 2025 → 47 notas  →  SUMMER 2025
--     ingresaron en 2026 → 87 notas  →  SUMMER 2026
--
-- POR QUÉ ESTA REGLA Y NO LA ANTERIOR
-- La anterior tomaba "la primera oferta del aula posterior al ingreso", y se
-- quedaba muda cuando esa oferta no estaba registrada. Y no estaba registrada
-- justo donde más falta hacía: 216 notas figuran hoy en un semestre que terminó
-- ANTES de que su estudiante se matriculara, porque el importador les puso la
-- última oferta que existía. En el aula 126 son 119 de 139.
--
-- Ésta no depende de que la oferta exista, solo de saber en qué temporada se
-- dicta el aula — que se lee de las ofertas que sí tiene— y del año de ingreso,
-- que nunca falta. El semestre destino existe en el catálogo en el 100% de los
-- casos: va de SUMMER 2023 a SUMMER 2027.
--
-- QUÉ TOCA
-- 213 notas que hoy tienen un semestre imposible y 38 que están vacías.
-- El semestre es de la NOTA, no del estudiante: cada asignatura toma el de su
-- aula, y por eso dos notas del mismo alumno pueden caer en semestres distintos.
--
-- QUÉ NO TOCA
-- 9 notas de aulas que se han dictado en más de una temporada: ahí el año de
-- ingreso no basta para elegir. Y 416 notas de aulas sin ninguna oferta
-- registrada, donde ni siquiera se sabe la temporada.
-- ---------------------------------------------------------------------------

-- PASO 1 · Antes de tocar nada
select count(*) filter (where semester_id is null) as sin_semestre,
       count(*) as notas_moodle
  from academic_grades
 where source = 'moodle' and withdrawn_at is null;

-- PASO 2 · La asignación, un bloque por semestre
-- AY 25-26 SUMMER 2026 · 137 nota(s) (110 corrigen un semestre imposible, 27 estaban vacías) · aulas 126, 129, 159, 292, 337, 345, 370, 576, 610, 634, 637
update academic_grades set semester_id = '92d1996e-dcde-4ec5-9049-bbcae76f8781'
 where external_id in (
   '019c0ff0-6f45-7a81-92c6-45d147a73cde',
   '019cb086-400b-77c3-aa87-69dfadddb2f9',
   '019cb087-26f3-7ecb-9a58-71c72583bbf3',
   '019cb088-110d-7394-a408-002ec3b1668b',
   '019cb089-e752-7590-9815-8e515949b16a',
   '019cb092-2456-7340-9bbb-9a8ba6f7e4f3',
   '019cb093-113f-7681-872a-e556a16a965b',
   '019cb093-f9f7-71af-9155-8c0b1331676a',
   '019cb093-f9f8-71fb-bee3-eb246e5d154e',
   '019cb094-e5cf-72a7-b0d9-72eff5d8bd61',
   '019cb095-cf67-7d01-946b-28730b58a65a',
   '019cb095-cfc9-7d8a-b962-9b15fbf338a5',
   '019cb096-b850-74f2-80c3-baf224f95349',
   '019cb522-8ef6-77da-bd43-11bb14b66af3',
   '019db717-e3bb-7e69-a6cc-437873d37d42',
   '019db718-cbd1-7fb8-964c-9e8f2d8184ab',
   '019db73b-9759-78c0-8db5-3e0746059469',
   '019df361-f6d3-787a-8910-815e37467abe',
   '019dff24-daea-7ad7-bf8f-d8b5438fb671',
   '019e46e8-302f-7b8b-8f4e-004e80377b28',
   '019e46ff-112d-7244-bc91-791b70ff80ec',
   '019e4706-646e-7e04-b71e-1f2bafe20a02',
   '019e470a-0d49-768b-8c30-ae168fa176b3',
   '019e4719-9ed0-75c8-b4d4-596c3164ab98',
   '019e60ca-ca58-7e97-aa8f-b4cf7e7d7ab4',
   '019e60ce-739f-7cc6-a682-781351bec0d1',
   '019e60d0-4781-70b8-bdd8-0781be78e038',
   '019e60ee-8042-77ac-bc01-2f3032d5b3eb',
   '019e60ef-6a2c-7263-a2b5-653abe5a9156',
   '019e60f0-547c-773c-ac46-bcba78034b9e',
   '019e60f0-54e2-7d54-b532-b253f85da396',
   '019e60f2-29ae-7c50-8e5b-2118097dc0e1',
   '019e60f2-29c2-7791-9511-d0d4e17b336f',
   '019e60f3-1411-72eb-8503-fecf75dfc1b9',
   '019e60f3-15c7-74da-8168-bc2e7b6b3705',
   '019e60f5-d2ae-72c0-b118-f2f1203d9edf',
   '019e60f6-bcdb-7b8d-9f54-cccce73ffeae',
   '019f1558-883b-7aa7-8540-1161ce1e8c7f',
   '019f155a-5c85-729c-bd83-eace0bfcd4d5',
   '019f155d-1bb2-76b7-bc72-e0e1f256a188',
   '019f155e-f102-71e8-9adc-d3aea965df0c',
   '019f1563-8588-7277-9706-ee409464a5b6',
   '019f1565-5ab1-793b-8956-f0d2b6ada2d0',
   '019f1567-2ead-7cf2-b091-e179d62bf8ae',
   '019f1568-1951-7969-b17f-5a2521937208',
   '019f1a94-27be-7c88-be08-38b6ff082a2f',
   '019f282e-9074-77c9-a0f3-90e48d1bfeeb',
   '019f2975-70f3-748e-834d-db790b013bb4',
   '019f2977-468d-7da1-be4a-fd039531a1e2',
   '019f2978-2f66-7242-9aef-ac07cbd10731',
   '019f2978-30dd-7541-bbde-c2abd987a5f4',
   '0c6ad5ac-346a-4b3c-8096-38af7bb65adf',
   '0cba2f2d-0db2-488d-a4e7-f85dc205be80',
   '0e136bad-99e7-4a43-a975-7bd5b6d67162',
   '0e5f2bb2-a71a-43f8-a82b-517351501ed7',
   '17e7fcf1-8a7a-4e8e-86bf-dbb94b467b3b',
   '1d138f42-5eb8-43df-b38b-89e0f8e6b946',
   '1e1d2dc4-2260-41e6-8d93-64ef0b08d78c',
   '202c6eb3-74c7-44d5-add2-ba5c75be1d6d',
   '2d80b853-736a-4148-bed8-ff59090a9c5e',
   '3053fd24-3398-468e-ad7c-d88a32b99632',
   '346d6c4c-f628-4dc7-b979-9687e4f016ac',
   '37bdbc8c-c093-48c0-b72d-ab143c0f70de',
   '37f8a0fc-877e-4dfd-ac95-d07ed74d6080',
   '395876fa-b634-4755-9362-0dabbf66ac35',
   '39e55019-5093-4cf4-8f0b-5185016bd4ac',
   '3b80a3e3-05e8-41f2-af0e-4e7bb6c65a36',
   '3be2f4f8-4974-47ce-a23f-4befadf80a89',
   '4681d66f-3db7-4322-b739-fff357579e0e',
   '4a1142ad-93f3-463b-98b3-b21cfe977f3c',
   '4dc0a13b-70ea-42e8-8594-9d0d6a65e42c',
   '50ac96ff-409e-4b5d-937c-9e4491a4043a',
   '531dea25-9dd3-4ba6-bf8d-fe8af22ef8d1',
   '5421b2b0-0150-4635-b467-13a818566350',
   '5bde2da5-1df0-4515-a770-8009b040defc',
   '5fa13042-60b3-4f47-9124-392c035f79f9',
   '62af5060-0f35-4bee-8674-38ce73d9a84d',
   '62ef467d-d3b8-4702-80d0-20313c28c1e4',
   '637ba14f-8941-4ddf-9f39-4f3455ebb757',
   '63c536f3-684a-4bb0-a326-de5ea9b75ad0',
   '6414e9c6-b571-4189-a28a-6faf27d35975',
   '6424d892-6dbb-421f-8047-5a200c76a4b0',
   '6589a5f5-df7e-42c9-8c71-eb338746dbe3',
   '67eb2362-6e9c-4235-a222-843385b9b21a',
   '69130d7c-6827-4bb2-997c-5b65fddf0b79',
   '69e289d5-0364-4e54-b455-e753afb9343b',
   '707e6625-f773-4ca8-9a09-4c1a9ef6fb21',
   '71bdceb2-483a-486c-a606-aca44f2db224',
   '738aed1d-e9d2-4ef9-b5e5-1162267f127c',
   '7972884e-4f5e-4b2f-ae69-a6b305fd7e05',
   '7b092ebe-472f-4209-ae8a-6dbbb0c209f6',
   '7b1db8d1-098f-44c1-ab69-168d1bcd96be',
   '7f68f81d-3f09-49d2-aa24-0dd19370793b',
   '843be08c-1699-4467-916d-c5043f072268',
   '846d731b-2f7e-47f6-8b42-3acf16aa6aa5',
   '876e3cc2-fa18-4793-bf81-38c65e5ce9b2',
   '8b0b3c22-f34a-4427-a46f-66439d6ca8ff',
   '973fefc6-e717-4299-a1a1-5764792b46a9',
   '985daa30-4f15-43c8-a945-12904e62f20a',
   '9c091c99-081f-4c33-85cf-abc81fbae3ad',
   '9e4e7a12-182c-40f6-9782-f49b00b3675f',
   '9f6fefc4-4c8a-4242-8d74-3eeb0db8693f',
   'a0d8ab3d-2860-4108-a180-9d97eed1c896',
   'a179551f-07eb-4410-a272-c36bb8cba292',
   'a398d317-091b-4376-a774-153d803e0a4a',
   'a4d61981-527a-4976-a732-4d8cf244a00d',
   'b59ef608-de0e-4447-bc69-09684cf984ae',
   'b656adb0-f68e-405e-8a6c-6f5011254eb2',
   'b65b30cb-9e2b-4469-b5c7-c984284121bf',
   'b87aebc4-30d3-4222-9975-2bcd43126a13',
   'b8868aa4-e7dc-4a87-9cc8-df20585b45a7',
   'bd2b0368-d263-49c6-8ad6-7a9f844a4a3b',
   'cf0fb551-ec41-48e1-9875-c800b7693c5a',
   'cf7ceca0-36fd-4df6-a873-86eb19eb6794',
   'd0e36c4a-d8f5-4463-b5ad-8eb9dde342e9',
   'd5b3d43b-3ef3-4e8a-a976-b8d03d3f6a27',
   'd6033cb7-7976-41a9-8892-967484bf9104',
   'd60f9715-9887-47bd-af48-35a58c978b27',
   'd654d40a-5d1b-4cda-823c-990bd34fa316',
   'd6e5a4b1-e0b4-4dc1-855a-bc357e50816c',
   'd9acfddb-1bd1-4a57-9134-94702b085ee7',
   'de82e915-de62-4bee-acd2-f0f19632e671',
   'df9941af-3c7f-427f-a81d-03a4c4575fa9',
   'e05a1e04-54cf-4634-bd53-a7c0aad08cf9',
   'e3ae34ef-ebbc-48a7-bb5f-bd82fce7fa62',
   'e4ce16c7-ca15-43e9-9788-c5a4ba4e20d8',
   'e5da1184-d484-477b-9ef0-29f15a1bafa7',
   'e7475a4e-5a0e-4189-98d1-cd54dbe92b11',
   'e754fb34-3fc0-48cb-adee-cdc2b77d2924',
   'eb60d551-4c11-4a0c-9153-ce306e9a42d5',
   'ee3fa514-49e0-441d-bb42-060e31ae0d21',
   'ef84fdcf-072e-467e-a98e-24b140a80c73',
   'f10356bf-7651-4a52-a7e3-9abe9247595f',
   'f3e9d521-a656-4dd7-9928-897a22709a46',
   'f979d750-5ad1-46e1-a323-4d272fb47f57',
   'fa3b0a4f-7111-41b0-973d-441893413439',
   'fa5ea50f-ac42-4f0a-93b4-d0a6c051b18d'
 );

-- AY 24-25 SUMMER 2025 · 58 nota(s) (55 corrigen un semestre imposible, 3 estaban vacías) · aulas 126, 159
update academic_grades set semester_id = '26af58a6-a65f-43be-b2ee-08850cf3ec37'
 where external_id in (
   '11feb2d7-e823-4b76-9d98-c5056f7bd4eb',
   '142aea01-a5f0-4d15-b86d-cbcfc9209ecd',
   '16c061ff-9341-4599-b63d-50ac230791e9',
   '1e7bf3a9-02fc-4a27-a47b-2a38e785324e',
   '258f2d1c-7d79-4891-8715-858e47df1fd1',
   '260e5c4b-6c0e-4ea5-a2c5-b162345a8325',
   '266b39a8-8b1b-496c-a4f6-bfc0de66a257',
   '2a5705b2-326b-46ec-bf44-89354233c910',
   '2ac148e1-7b8c-4c77-93c9-0643a3d90e18',
   '319e5faf-30b2-4567-98f2-ab9004ebed6d',
   '3230e157-d380-4281-a975-a5011f26291e',
   '37672341-05af-4321-938d-a29aebd4778c',
   '3efd8583-f66d-4d8d-ba6f-b1f7a45861bb',
   '3f98ef66-032c-4261-9aa3-ddff74cc06ba',
   '4b0842ff-423b-4ded-bd24-e0dba3e131e6',
   '4d891b6f-5a7b-40ed-b95f-9821af368125',
   '5119a3a3-67fb-48af-a7a6-5cfffe7f09dd',
   '516cdd31-6894-4093-a9fe-3361dcc40cc4',
   '5235c544-a055-4999-a1cf-7f61e89bff26',
   '524813a1-6b92-45c0-a6b2-1939512077f1',
   '5492bdfb-3c3e-47ed-bdda-4a5fdec94479',
   '54bfdeee-0379-4eca-a228-7b20203fafe9',
   '5637aa87-e0a5-4672-bb92-7a5caaee0bf7',
   '5a5a72a9-5af3-43a4-bedd-7f064df8d944',
   '5b6d4d63-849e-43b2-a73b-5f8c5b1ca27c',
   '5d5f6a3e-cefe-4622-84eb-d5289ab4822c',
   '630bb747-7a43-4b0f-9774-06d805d70eea',
   '68d80006-a9c9-4bdc-a79b-a186387782a4',
   '73e8e6b4-1a6a-4d2d-904a-4cc73e61528b',
   '757e8dcd-47f2-44a8-82ef-36d2227a87fd',
   '7ec79287-00b5-4a10-b546-f0141934e52a',
   '831163f4-ae09-4d4f-8a81-946c5c817096',
   '845f2ad0-e0fc-4b2a-94bf-c3482acbd391',
   '89d35004-72c6-4a7a-a88c-1148838f4b40',
   '8b03ad55-93a3-40cc-92a8-d1ff45109e5d',
   '8fbc311c-905b-403d-8275-6a2e5b0240ac',
   '9dc41ba2-5d19-4d3f-801a-7d28d94db50e',
   'a1e579d1-10ab-44db-ba9a-f9c01bb2fba0',
   'a50833b7-4d15-47b7-8d98-bc7c3cd0b94d',
   'a6f4a725-23fc-4f8e-82f4-77b3468b7776',
   'afb74159-37de-4b21-8d58-0cb33cbc99e4',
   'b7ac84c9-7821-4fe4-af67-4281ef21654e',
   'b7dcf9c6-ab0a-421e-bb78-ffdb6fd50546',
   'b80d5a24-fbcb-41f5-83d5-d439a101602e',
   'c670d1a3-9b94-4687-bb3f-8203d0d9cbb8',
   'cac95407-8c8f-479f-85dc-0e8aaef7f416',
   'd0d2f675-fe94-446f-b45b-e124423df22d',
   'd30b182f-45cc-4a1b-a2a0-45fd73a227e5',
   'd423818a-de43-4c2c-b2f2-40e36da0f841',
   'd76f69f7-c695-4bfd-b2d7-b9a11b3813ca',
   'dc5e9fbe-3fff-419f-b8b2-c26d96e2f5b0',
   'dcdfb94f-14f5-4784-a632-778f3a1e6f69',
   'df81248f-7982-47a8-89cd-f81886f65042',
   'dffd7b60-e389-493c-813f-b0290a465cf8',
   'e06c7f3b-06c1-4b11-a7a2-005718d8d9a9',
   'e8c6c4b8-58dd-41b5-99f5-932129fa4073',
   'eac94e26-dfdc-485d-a75f-fa371ca0f3a9',
   'fab73a17-2c83-401b-bd20-3d0984d15566'
 );

-- AY 26 - 27 FALL 2026 · 24 nota(s) (24 corrigen un semestre imposible, 0 estaban vacías) · aulas 577, 590, 609, 633
update academic_grades set semester_id = '78e4ea47-bf10-4eba-ba88-4f5d20901262'
 where external_id in (
   '019c9189-b588-7193-9d4f-fa95457d8e81',
   '019c918e-46c2-730b-a74f-d3ff1a34261a',
   '019d2c18-8ec6-71d7-9669-4e15b6d2ae5c',
   '0451ff6d-6085-4464-8111-8c8d40909a11',
   '057ae615-8d85-4ec3-b118-dfb7941eb00b',
   '0620afc5-5da9-4259-bba9-35065062d0b0',
   '1fbe5e3c-b8c0-4c73-9e45-3bd818e07f31',
   '2269cb2a-79bf-4944-a565-320fe2d78faa',
   '2bfe6a03-afdb-4be1-8bed-d13cdab6bf75',
   '4cf9245c-13e4-4710-b176-fcac77a3f1b7',
   '58577af0-920d-487b-8561-e268906982c4',
   '66e07d23-69be-4984-87d2-21eea94d5f93',
   '6de36cdd-08ed-4e78-a0c7-889edcf89248',
   '71aae68e-22c9-481e-9014-02c8dd250617',
   '733886d9-0a98-494b-957a-7b95f4c78db3',
   '84930845-a9c1-42eb-b5e1-bcaa417b9fdc',
   '8a52d93c-b8b1-4804-9bb3-d1e1f52657eb',
   '8a7f6927-35d1-42c3-8dbf-6546e48ec10c',
   'a0442f50-3f3e-4a15-abbf-95e5dd34aff3',
   'ab0f0041-fbcb-4ffa-9744-23d3f258e6e2',
   'bcdce8ed-7492-4f11-85a5-98cb5c4d5f15',
   'c7db5752-6cfe-4dcd-935e-ab69a32ba9f3',
   'df38ce59-0cd6-4dff-938e-e10cbceb5784',
   'f7e96c5c-de23-4472-aa41-f1304cad0305'
 );

-- AY 25-26 FALL 2025 · 21 nota(s) (19 corrigen un semestre imposible, 2 estaban vacías) · aulas 247, 577, 590, 591, 609, 621, 633
update academic_grades set semester_id = '86fe3d63-6b23-47ed-bdd7-6793b5364296'
 where external_id in (
   '121127d9-4091-40ff-9268-064148441738',
   '1695641c-3092-42b1-9cdb-a0ad7af493e4',
   '19333a63-531b-402e-9df8-138e6f1c9923',
   '29e3fa01-1ed3-4575-a877-3a2c3863cb32',
   '46554aca-28e8-4160-beeb-5c4d17b0f4e2',
   '4b66b343-59ef-405d-9eed-bc5054cce13f',
   '640c072a-b16d-4fa2-ac4c-1d77c15a86d9',
   '671ce457-bea1-48b2-bb94-2b9c6e091fc7',
   '7ba428b2-ae4d-4a8f-9aa2-74c3e52f6b67',
   'b43a0808-ddfb-4157-954f-38077c2f392c',
   'b65bcf51-2158-46e5-ac65-18e50f12a978',
   'bc9131be-fadd-4ce7-a8a0-7b1842d614dc',
   'bd1430b3-f378-4c69-9ab3-ebf7cb0b4a32',
   'c97c6b42-50da-4ff7-a588-2416653df7a1',
   'd935f640-c47b-4a06-b78b-e27fdd3253fa',
   'dd1bb182-7665-454d-ac6b-1e398a05ee33',
   'e94cfe4b-a838-486a-9a7f-a442ba099cc2',
   'ef53e218-c6de-454a-8ca2-5289855aa1ec',
   'f2ef50fa-a072-4b0a-a520-920b733ed210',
   'fab012b4-9961-4be8-a57f-b51cf530d540',
   'fbb2576b-0f8e-40f5-b51c-0b2729e45eb3'
 );

-- AY 25-26 SPRING 2026 · 9 nota(s) (4 corrigen un semestre imposible, 5 estaban vacías) · aulas 311, 324, 330, 343, 584, 585, 596, 627
update academic_grades set semester_id = '5161ae68-20ef-4fd5-b730-133c2b453823'
 where external_id in (
   '019c918e-4775-73b8-b78a-4d5534e17ad1',
   '019cb096-b8e8-7c53-999b-6c30463d1502',
   '149b1c86-fb0e-4f95-97fa-00413c1b44a0',
   '1a18dabf-38da-4b74-b862-5c8dc9165558',
   '21929f87-53c2-495e-a421-e0b06b28c9d2',
   '406c1c75-5fac-496c-80a7-a358f37cea56',
   '9070e089-e400-4532-ba80-00dd7ae64abf',
   'bf2d0a73-d211-42a4-a494-99d3512220de',
   'da711d16-822a-4973-abd7-bddd88150f02'
 );

-- AY 23-24 FALL 2023 · 1 nota(s) (0 corrigen un semestre imposible, 1 estaban vacías) · aulas 131
update academic_grades set semester_id = 'c57b0493-2484-4c51-9777-0b918dcde970'
 where external_id in (
   'b2d7c06c-5b34-4986-a503-7a3071f21222'
 );

-- AY 23-24 SUMMER 2024 · 1 nota(s) (1 corrigen un semestre imposible, 0 estaban vacías) · aulas 126
update academic_grades set semester_id = 'f486ea73-cb8c-4b7a-ba3f-43c30ebccebe'
 where external_id in (
   'c319a877-7307-455d-a8f6-713b99f9a4bc'
 );

-- PASO 3 · El invariante: ninguna nota en un semestre anterior al ingreso
select count(*) as imposibles
  from academic_grades g
  join academic_students st on st.document_number = g.document_number
  join academic_courses c on c.id = g.course_id
  join academic_student_enrollments e on e.student_id = st.id and e.program_id = c.program_id
  join academic_semesters s on s.id = g.semester_id
 where g.source = 'moodle' and s.start_date < e.enrollment_date::date;
-- Antes de este archivo devolvía 218. Debe quedar en 5: las de aulas con
-- temporadas mezcladas y las de aulas sin oferta, que no entran aquí.
-- ---------------------------------------------------------------------------
