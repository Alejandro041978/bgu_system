-- ---------------------------------------------------------------------------
-- Las 416 notas de aulas sin oferta registrada.
--
-- POR QUÉ NO SE PUEDEN DEJAR SIN PERIODO
-- Las 416 tienen calificación y las 416 registran actividad rendida. El curso
-- ocurrió: se estudió, se evaluó y se calificó. Que Académico no haya registrado
-- la oferta del aula es un hueco de nuestro registro, no una duda sobre el
-- hecho. Dejarlas sin semestre sería dejar sin fechar algo que sí pasó.
--
-- POR QUÉ NO SIRVE LA REGLA ANTERIOR
-- La de temporada del aula + año de ingreso necesita saber en qué temporada se
-- dicta el aula, y eso se lee de sus ofertas. Estas 64 aulas no tienen ninguna.
--
-- LA EVIDENCIA QUE SÍ TIENEN, EN ESTE ORDEN
--   1. Las otras notas YA FECHADAS del mismo estudiante en el mismo programa
--      (290 notas). Si estudió lo demás en un semestre, esta asignatura es de
--      esa misma temporada de su vida académica. En 229 casos esas otras notas
--      apuntan a un único semestre y la elección es directa; cuando apuntan a
--      varios se toma el de mayor actividad y, a igualdad, el más tardío.
--   2. Cuando no tiene ninguna otra nota fechada (126 notas), el semestre que
--      estaba en curso al matricularse.
--
-- En los dos casos se aplica el mismo límite de siempre: nunca un periodo que ya
-- había cerrado cuando el estudiante se matriculó.
--
-- HONESTIDAD SOBRE LO QUE ESTO ES
-- Esto es una ESTIMACIÓN, no una deducción como las anteriores. Las otras se
-- apoyaban en el calendario del aula; ésta en la actividad del propio
-- estudiante. Es la mejor evidencia disponible mientras las 64 aulas no tengan
-- oferta, y es mejor que el hueco — pero cuando Académico las registre, conviene
-- volver a correr la regla del calendario sobre estas mismas notas.
-- ---------------------------------------------------------------------------

-- PASO 1 · Antes
select count(*) as sin_semestre
  from academic_grades
 where source = 'moodle' and withdrawn_at is null and semester_id is null;
-- Debe devolver 420.

-- PASO 2 · La asignación
-- → AY 24-25 SPRING 2025  (2024-12-30 → 2025-04-27) · 104 nota(s): 86 por vecindad, 18 por ingreso
--   ej: Carlos Oswaldo Venturo Orbeg Business and Professional  aula 515   · por sus otras 38 nota(s) fechadas
--   ej: Dana Paola Tacca Machaca     English Composition I      aula 711   · por sus otras 19 nota(s) fechadas
--   ej: Shadia Karina Lopez Castro   Specialized Sports Nutriti aula 399   · por sus otras 1 nota(s) fechadas
--   ej: Giuliani Veronica Villamonte Motivational Systems SDI   aula 567   · por sus otras 1 nota(s) fechadas
update academic_grades set semester_id = '99eb526b-f6bd-462d-9c77-9f4ba1583603'
 where semester_id is null and external_id in (
   '01dedf68-da1a-4e85-953d-75e23ff279f9',
   '02192823-6549-40c0-a981-1bdde70a9201',
   '03ad0817-35eb-487c-9459-7b9df32540f3',
   '05363941-57a7-4462-8ed3-affa53fa93de',
   '05d5f049-f42e-477e-a7e2-463c7041acc5',
   '0775ceda-18c0-421f-bc78-e66ce7f437fc',
   '0929d60d-77e3-4ba7-8443-585be2da74b9',
   '0967ff87-6c9a-47a5-bd17-b48e9fac89b8',
   '0ba56bbf-c05a-497b-8a55-54062234892f',
   '0d1f9f3c-2b3b-4def-b0c8-43afe9fb002e',
   '0deb0c86-a2fa-4fb9-a21f-1da99161beb9',
   '1180bdcb-80da-481c-ba01-ed5f94610294',
   '199dd1d9-5da4-4849-8f06-876aacd3b6eb',
   '1be8dea9-7102-4f57-a619-41a3b0472a22',
   '1c7b668f-cef3-4f21-8332-ead5d2022fc8',
   '1cf2b9c0-112d-402d-8426-83d6b90b7117',
   '2117554c-33c3-4b90-a6fb-bccb0412e0fa',
   '212b8f32-40a7-4fea-8066-d02cf57160a2',
   '24e10668-66b7-4d3c-81fc-c965377c7d90',
   '27862b27-d434-4977-ad36-8b82283cd0ed',
   '29132e54-0349-4f59-a09f-f3c46d29debd',
   '2b28282a-5d2e-444c-a592-6f1f71ba1cff',
   '2c98f1d1-ece9-486d-a21a-9e3bb523f2e4',
   '341df695-5c36-4400-8b7e-9d6e98aad2df',
   '3cc018c4-0d33-4f9d-83f1-172b975a9c86',
   '3ec30815-dfe0-42bf-9c62-ebb4bb5b4a05',
   '40f120cb-8f3e-4942-a2cd-b1a63d27d936',
   '4202eae8-5220-4b8c-a083-8d158a02cb3d',
   '4b21b19a-0270-41a6-a334-fc2a64ccfb79',
   '4b60d030-fd59-416f-ab53-40e3e6acbebb',
   '4bf6d5a0-0696-4a6d-971c-dc8a423a364d',
   '4dda4e01-b30e-41e3-808a-44f4cf32e22f',
   '4e9d4578-7b08-471c-96b4-2229980acbac',
   '4ee313b9-c77f-43ed-aea9-d2d0e6e6fe04',
   '502fb5b7-0897-4dd8-8a6f-f9bdcbb74f65',
   '51594d9e-0f3a-47ae-808a-ab2e1a68d4b1',
   '59f54345-af5d-4c6e-a0c3-88509dd63fb2',
   '5b3b945f-b8ef-431e-a6a4-8cf5cee1d7fd',
   '5c4ac044-9d86-400d-a6dc-79f0df21e1f0',
   '60cc6dd3-7776-465f-a909-e7fb57bf95c5',
   '65272814-70b5-4196-83e4-e242ef438a53',
   '6b863b6a-edd0-4e09-90c1-ed50fc0ac201',
   '6c9d0ebb-24e8-4b7b-94ca-2612a675d180',
   '6d23ce78-b385-43a3-b0a2-58d615132efc',
   '71090559-54ce-4d80-955d-3a185572fa1d',
   '7436f2c0-1b49-4c35-8961-df3586c400bd',
   '776e875f-5839-4a03-86e2-d2c5be8f9e1c',
   '7b0fdf85-125c-45b7-b315-4ae66df23880',
   '7dc35c7b-7d14-4cef-ab86-56cee6c185a5',
   '82281d7b-840d-4ff2-85a3-40e3459f2021',
   '82f4986d-9335-4019-b4a1-eb681922ad14',
   '8459509c-313b-4a2c-a2de-e8739ffb3da9',
   '8612fd03-0be9-43ad-904c-603b571ba69e',
   '8703ad91-aff6-41fb-8f7b-2d0ff35b1978',
   '88cb2fb0-2a94-4ff6-9a5b-d15b87d79818',
   '8ed6796f-f03d-4ac1-92ec-7a7e13777c89',
   '8f767cfc-2399-41d5-b8ae-1cdf79fdbea4',
   '91fda0df-0803-400c-8b05-4c5c68bd3e71',
   '931b86f7-7047-49f3-b598-5262564c2b2c',
   '9577a737-a491-45e7-befe-444784996273',
   '95a9019d-9ef2-4721-9f6f-99dcc15c706f',
   '95c91204-4e6a-4279-877e-6dc3cfe747d9',
   '9625e484-b1e1-4e06-94d1-3e8bdd75664e',
   '99b46aaf-c3ad-4338-93c1-651c6b4ae7a7',
   'a0a9bb91-7f56-44cb-81f2-47275ce7eba8',
   'a1ebe41b-0508-4b5c-9d7f-c0b261f3368b',
   'a321ec9b-7a82-48fd-a8d4-58544451700a',
   'a44688d6-74d6-420d-a1b4-2958d80d530e',
   'a44de3ce-d82f-4279-9f52-03ccdad11d2d',
   'a81a2126-9219-4f57-b99f-6e69c3b03751',
   'aa7e6582-4faf-473c-9981-844128b9a3bd',
   'aae90427-fcb4-4a79-ae49-1f855c4cf9fe',
   'ac313f17-128b-4e3e-aea7-fb8cedbf4641',
   'b2b5c077-a022-4dea-89a2-c9379a7cd8b0',
   'b4704bc9-2697-45ab-97e9-99ad099a8bda',
   'b7a1a9e4-b51c-4e3e-9acc-fbda399d52ef',
   'b84775df-5013-4f46-a8de-a3ade698a45a',
   'b9e0600d-790d-44d3-8ac9-dd4f284d90b3',
   'bccf653d-b461-4687-982e-9d9fa4db83b1',
   'cde6ab87-4695-46cb-ad6d-623b860b7ab0',
   'cdfa5361-ec43-4486-b5d0-ad7b26d91ed8',
   'ce0e0668-cfcd-4b56-995f-35f5fed74dde',
   'ce1c48ba-c74d-456e-ab04-f888ce92eafd',
   'd38754d9-bd16-40ee-a0a4-d322e7663086',
   'd3ad6514-d48e-41e7-be31-4a083701296c',
   'd4effff0-143b-4fb5-95ec-d15a52c132b2',
   'd8cddeb5-a650-4227-9e68-f42d1e616da0',
   'd8e5f85f-7f90-4e9b-860d-e5ae4fbf6986',
   'da351448-ae61-48b8-9b52-f9df5d9700a2',
   'de0681a7-a8ee-47ac-b340-389173539680',
   'e07d48aa-9b85-4237-a838-e0087001331e',
   'e5005624-0950-4903-9c6a-1f881bc7f2a2',
   'e6154b1d-149a-45d8-823e-b8669e448270',
   'e78f691f-23c7-4c16-b25c-db22e2e54906',
   'e88a28a1-6bc0-4c50-bef3-5906bdf30388',
   'ec187a2f-ef8f-4946-bfb6-7461341aa6bf',
   'f215dcdc-ef30-417c-bac3-ef94b7259c52',
   'f274d9d2-ec2e-4da8-b131-8ea9d28db9f6',
   'fb38ba67-c46a-4611-8953-a4a3ee3ba879',
   'fd4605b5-a48d-4018-ad71-08bb634b3feb',
   'fe70f135-03e8-45c3-961d-12e2cc088d66',
   'fe783dce-4e69-40ff-894b-610b50db56c7',
   'fe8b57c3-f1cc-4c0b-95cf-dc936d451e3e',
   'ff328bf4-c94f-4ada-8a6f-1542846fd9df'
 );

-- → AY 24-25 SUMMER 2025  (2025-04-28 → 2025-08-31) · 100 nota(s): 43 por vecindad, 57 por ingreso
--   ej: Carmen Maria Bonilla Torres  Promotion of Gender Equali aula 430   · por sus otras 3 nota(s) fechadas
--   ej: Laura Gabriela Acevedo Poza  Negotiation and Persuasion aula 477   · por el semestre en curso al matricularse (2025-06-11)
--   ej: Millicent Joseph Loaisiga Or Process Management         aula 448   · por el semestre en curso al matricularse (2025-05-11)
--   ej: Pamela del Pilar Guzman Jime Emotional Intelligence     aula 483   · por el semestre en curso al matricularse (2025-06-09)
update academic_grades set semester_id = '26af58a6-a65f-43be-b2ee-08850cf3ec37'
 where semester_id is null and external_id in (
   '030b9da3-6c8c-4d77-8633-d394141fbe6f',
   '076e7231-b727-4537-a793-37fb319afe41',
   '09066a5c-c85a-4b8b-90ee-56960558fd64',
   '0bc8271a-c6b9-47fd-9a31-cf3d21388ad6',
   '0be058b6-3dc7-4050-a0b7-ba751be2531d',
   '1337075d-9288-4929-bba7-8bd47828a4ff',
   '190b934e-5f97-4ad0-bc91-d4b6329bdb7f',
   '199d6a82-79a5-4b61-8318-b582d15ddb03',
   '19ae8390-d19e-4bb6-8e6d-47da4cd41df6',
   '1bcef832-6e3f-44ce-b811-8e994e27f369',
   '1c33bc6a-b594-462d-93fe-b8406df1e0b5',
   '1f4adbd0-9eb1-4253-b208-a11c88b24ced',
   '2053c5c3-384d-48ec-889c-a2a4ede36244',
   '28add505-3823-41d7-bc79-4dc1f2e08ff9',
   '29bc8697-08ba-4cc4-a3ce-009bcada0a16',
   '2e7cd387-e0ff-44a4-b34c-9450c4a6cddf',
   '3018705a-804c-4c5a-916b-09993d12bd00',
   '3080c60d-8b7e-4c17-9e78-26c8c370a5b9',
   '31a08338-7403-4772-8d01-5329e5680a2e',
   '31b6c185-4bf2-4a87-95d4-6a7d08211279',
   '3853083e-6394-4fde-a822-29201d56ba37',
   '38a7db82-be0d-46c6-8ec6-d384e0de1356',
   '39495031-a3af-43a8-b8b0-b44245909407',
   '3b6ca4da-cb31-439c-a680-967b6117e312',
   '43f59c75-edaf-4cb4-b49e-2c3884a33782',
   '46215958-5097-406d-bc33-dc3420adafc9',
   '48b100de-08ce-4763-8bc0-170b299b4866',
   '498d143b-7363-42b2-be20-be0fda756e2a',
   '4a808dde-183a-4f80-83de-c8ec16865cc2',
   '4aac8d88-55db-4635-ab2a-62dc4a81bed3',
   '4da17050-61b3-4f3d-8d3a-b595cc9c6a61',
   '4dc68d59-7d68-4c3b-87d9-470f8e2319c1',
   '53a46395-f3b9-468a-bc1e-50e050a35022',
   '56434daf-2eb6-48ab-921b-922148b20e0d',
   '56c73b97-d632-496e-b7dd-cb786327cfb0',
   '58120e12-7766-49fa-b8b3-f198982e3646',
   '59bf4ca1-1b46-4d7a-9a39-fd3a03f3e169',
   '5bb52e85-0bd2-4bf7-b9b0-ac58e8646f63',
   '5dafbf6a-b5a5-4927-83cb-44efbe58f983',
   '5decc550-e976-40ae-b312-5820f7aac6a6',
   '602cc74e-c0cf-4826-8735-246785034c42',
   '637c243c-a694-4845-ae5d-dea9b8010acf',
   '65b23f02-41a2-4adb-9961-21161478982b',
   '6665f2f1-1fb1-4c18-9fac-0ed1c5e4425f',
   '6857c35b-a99d-4fd9-b41e-3457428b5dd6',
   '69abad99-3c2b-4f41-a18d-060f5a4b94d1',
   '6caae937-5820-4388-949e-8dc644b8491f',
   '707e9b7d-7879-4ea6-ba5c-ac268556005b',
   '7174c7cf-7703-43dd-a58d-1bd6b4f22cdc',
   '77862a45-44c4-4ce9-bb2f-ba53fa7c194b',
   '779718eb-98a4-4df2-9d52-3b3f7382e2d8',
   '77aaf59a-a272-4ece-a833-2870db2167e4',
   '794c436e-fc89-48cf-ad9a-3eda67dc07ba',
   '80be428d-db97-41f1-b0d4-58f6dbf88bf9',
   '83d2cebb-0641-417f-bcb1-a84e4b224d72',
   '85c9e6af-8b8e-4212-b3a6-1d253ec115f3',
   '86107923-7a03-4707-a774-416da7728878',
   '86457317-68c4-4824-a305-1a7c7900ab35',
   '88412fac-8231-4796-a17a-dacc37ddcdeb',
   '8bad2007-4267-46f5-957f-d41a8dc6f0a4',
   '8d194b7d-bf7b-46d1-a603-0bc13a6c0a88',
   '91891a74-688c-4527-a8c0-932b3f37cc5a',
   '9198b248-801c-4f8b-bd93-15ee876c7e7d',
   '92ba6d39-2763-47b2-89dd-d61fa4dfd2a2',
   '94fb9754-e5c6-4355-a620-9af6e9939af3',
   '956beb60-443c-481c-8a00-8563070838de',
   'a1b5d29d-4919-430a-a0b7-61d2fbdf92dc',
   'a3175763-9de2-422d-bee9-02bd81fe48c2',
   'a3cf3fbd-a61d-4717-a6a1-66ea72cfe337',
   'a5e9db47-4047-4c3c-a8df-7c966bcb1046',
   'ad9bff97-a95f-4a00-ac72-32268fb80cda',
   'af4edbcc-a5ee-4646-9a4d-b32c22af21a6',
   'b29349e3-f030-47f1-9d06-5ae5681cf9f1',
   'b2d8b099-21d4-4c2b-a3d9-b4e50b450708',
   'b41094d2-7b48-4c2b-9edd-82ee69436a86',
   'b9942b31-9191-4d4b-8151-29668723adcb',
   'bfd9a8ef-6019-4789-b2bc-150089e2407a',
   'c24575a5-3c1c-45bc-9aff-1791498039a7',
   'c6b8f74f-83eb-4f7c-8ec7-77c3b898bd77',
   'c78f4598-76dc-40df-a2f3-fef9bb07b95d',
   'c83c72d9-440c-4f87-9516-a03ddcb0dab1',
   'cc5e2f18-6ddd-48df-a414-19baa8a13a66',
   'cffa3cca-c9bf-4ad5-b796-05925dd113d2',
   'd53eef86-6a74-45be-bc60-ce927c4952ba',
   'da0c2fac-a0b6-4389-8e9e-a6d4e9f76c1b',
   'db00e49c-d295-4eed-b6b8-722acedf8fca',
   'db1d0df3-5ffd-4a01-b4ec-7dc397116719',
   'db36e133-2f89-4a1a-abd2-800c95a3fdbc',
   'dcb6b702-3e0a-4a9e-826e-8d961dd88558',
   'de6f743d-0ffd-4309-b8c8-f6246218c7a8',
   'dfb18019-9fb0-43f6-bf82-37413d80e619',
   'e4824330-0ac1-4b1a-a0a8-6d70f1be0092',
   'e85af4b2-acf9-4846-a91f-066c72524a20',
   'ed5b4169-bc08-4ff8-a149-d0294ff3bcbd',
   'f118c1da-9688-463f-8b46-931e1bb06c2c',
   'f1ba1516-2f5b-4662-9006-bcfdc5b891a5',
   'f3053287-42af-4328-a3b9-1afa6d575aaa',
   'fb4cabb1-cb2a-4fbf-85c6-2af572a80739',
   'fcbbbb74-fbdd-47f7-a836-9de055c239a4',
   'ffe75702-ffc8-4fd1-a54b-e55878c6e75f'
 );

-- → AY 24-25 FALL 2024  (2024-09-02 → 2024-12-29) · 65 nota(s): 59 por vecindad, 6 por ingreso
--   ej: Roxana Elvira Martínez Fonte Nursing Interventions in t aula 385   · por sus otras 1 nota(s) fechadas · corregido para no caer en un periodo cerrado
--   ej: Emilia Alessandra Velasquez  Psychiatric Emergencies    aula 403   · por sus otras 3 nota(s) fechadas · corregido para no caer en un periodo cerrado
--   ej: Karla Cecilia Chavarria Alva Psychiatric Emergencies    aula 403   · por sus otras 3 nota(s) fechadas · corregido para no caer en un periodo cerrado
--   ej: Carlos Jose Osorno Sanchez   Nutritional Planning Appli aula 398   · por sus otras 1 nota(s) fechadas · corregido para no caer en un periodo cerrado
update academic_grades set semester_id = 'c9d1c866-2e36-43d1-8827-f6c589a8ee67'
 where semester_id is null and external_id in (
   '007fa5d8-21c8-4511-812a-78f0e0ec21c2',
   '012bbbc8-0cdf-432a-aa9e-61ec8a0e3ee4',
   '027e322e-91ba-4832-a517-5d3f4b0d3baf',
   '08f3c9ff-b39e-4961-8795-c89643a29022',
   '0d61d55c-09fd-4048-8a4d-7987d8bd92e1',
   '11e8de73-cd98-4b5a-b7f9-8a09cca89fae',
   '14ef9a4a-5c0c-4f7a-a46f-990ffa3ff7f6',
   '163499b0-dbad-48ee-aa2c-d493ef13277f',
   '2176c116-3144-45c9-b8ff-281ff0901779',
   '27cd8ace-6fb9-4c37-9487-5d1062429f58',
   '28233d55-58f2-45d6-8550-3726d8d86c98',
   '31980f4b-6d59-4115-a7c4-1b127b5a3094',
   '33593ee0-1007-4013-ab59-36db03cc6f85',
   '35f95b35-bdd4-47a3-b243-e46d08be67d5',
   '3b3238d6-4f72-4c6c-a889-e39ea4fa6b14',
   '411a75f3-7e40-4618-aed3-e4d5b06cf8ee',
   '419b95f6-c5f4-413d-b757-92dcd67c6417',
   '45768b59-25e5-4934-87ed-d443f06c9019',
   '4ae002dc-f330-4b5e-b5d0-788c2773bdf6',
   '4bb7bb90-a555-4306-95fc-fc9c2dbe69cf',
   '53a35b32-0790-4002-bea8-fb2fc0286754',
   '53b26336-a913-40ff-8a1c-14f6ef11571f',
   '56a2c179-369d-4ad5-bf7b-4f7223db3e78',
   '5a9f8c67-9cea-40d1-8c87-3bb855a50872',
   '5adcc5c6-515a-4aa1-9d55-a8bd7bfbf4f2',
   '61be29c9-7f13-4959-9069-9de8ee21d105',
   '63612b18-56fe-41d8-a91e-bd8a511c6d0f',
   '6602d05e-f8da-4d4d-b2c2-269918d8192c',
   '6883a098-81b5-4085-9e71-f3ee6e126f6a',
   '69a01f95-aa7b-40cf-9bee-11348b470c83',
   '6bc17ca3-8581-45a3-abf8-ace693ba4c87',
   '6bda9ddc-af7e-40ba-a9c8-55cf111b1a56',
   '6de5cf9f-5951-4be8-aa93-44848c5addfe',
   '6ef1f81c-6340-478b-af14-c9174da25d60',
   '70ab590d-dcce-4817-ac24-e22a61a67768',
   '71f34339-a7ca-4fef-af99-1000984fdf18',
   '72fb4e90-48b7-4385-98b1-beb94a6b47d7',
   '778a65d6-ff44-4166-a7fe-e716853d46d2',
   '7b317bef-bba0-475c-aacd-96bcd35c5c13',
   '7f519039-acac-4031-b3ae-eccfba8a6570',
   '8366b71b-288d-4eaa-8100-6ce9b8c40669',
   '92203ed7-0678-49a7-950d-a7cf827ce4bb',
   '9a5a51d2-1e08-4afa-b2b2-9902b8b9c6db',
   'a9d7a3f0-c1bf-44c5-a799-6ad3bad8de94',
   'b346dce8-d19a-4cdd-abee-aac7e1bf1076',
   'b3f2c955-9463-4520-9ac2-0f3387acf767',
   'b81b14b7-da39-4380-8d1b-61a3d619e6c2',
   'b96b1264-63df-4c38-9d39-838efe797d6e',
   'bcd92a6b-8464-4d3d-82ae-af71eeb93db7',
   'bec44883-0975-4984-b9b9-fabed70befde',
   'c0144482-a9bd-43d5-a9fb-7504e3337de6',
   'c345f020-45b8-47cd-bf18-5d68ec3053e7',
   'cb428bab-00f2-4956-ae2b-009f567b181f',
   'd05fa0d0-2559-4909-9ea4-b55e57bda11a',
   'd1f664d8-6a93-4b17-9787-561326a16a7c',
   'd69169b1-ab45-4515-866e-7029fbb0efa7',
   'd99b868f-28bb-4830-b9f1-9141f1cd6754',
   'dc31cbab-f0dd-4837-872f-6f03bafa7ab7',
   'dd415941-297c-47cd-a038-09305fb9a695',
   'dd730773-5279-45ba-bf3c-8d623df9e9f1',
   'de136b60-552d-4c0e-8df2-ec791985ff49',
   'e0ddbfab-0108-4a20-ac48-35a69f36da97',
   'ee044a3d-ac8b-438e-940f-96833b95b8c6',
   'f1dbb8c0-b4cf-44d5-b276-e5dee5dbdc91',
   'ff6b50f7-c4c2-46da-b6ae-03d08c4e546b'
 );

-- → AY 25-26 FALL 2025  (2025-09-01 → 2025-12-28) · 53 nota(s): 20 por vecindad, 33 por ingreso
--   ej: Gerardo Antonio Polonia Bell Digital Ecosystems and Ele aula 661   · por sus otras 2 nota(s) fechadas · corregido para no caer en un periodo cerrado
--   ej: Jorge Mario Gomez Jaramillo  Analysis of Environmental, aula 666   · por el semestre en curso al matricularse (2025-10-27)
--   ej: Maria Del Carmen Quispe Huar Psychopathological Alterat aula 400   · por sus otras 3 nota(s) fechadas · corregido para no caer en un periodo cerrado
--   ej: Shervana Francia Francis .   Psychopathological Alterat aula 547   · por sus otras 4 nota(s) fechadas · corregido para no caer en un periodo cerrado
update academic_grades set semester_id = '86fe3d63-6b23-47ed-bdd7-6793b5364296'
 where semester_id is null and external_id in (
   '0141769c-40b0-4729-88a2-61f46f5f44bf',
   '10900260-7d10-4af4-8392-3e7c9da267dd',
   '10a078de-67ab-4a7b-bf3d-50778a0197d3',
   '10d101c0-3389-4f8f-a412-52cf858e2a39',
   '13aa4be3-eb9e-4fe5-b8b4-a9f1fcd1dfba',
   '1b1a6070-c1dc-4615-b19b-eb4ed3f8b2de',
   '22ddcfdf-729c-4d7e-9916-1faa4b8d13eb',
   '36fcf033-2bc6-4cc5-9911-f3570d12bc33',
   '37276423-dae8-4798-a730-ed9dee212578',
   '3830bd4d-1193-41e4-bb3c-000aba5c7113',
   '398f7088-31ec-4b3a-b422-8ec424e75685',
   '3bafe5cd-e38d-40c8-9f2b-aa8b6bf2d8f8',
   '3d48d28f-c086-4ecb-9c8f-56c896f32025',
   '3e79a654-fe4c-45ac-9af0-cdd38dfce07a',
   '40df08b7-a35b-4b24-b582-28f54e944b40',
   '43a0b5ac-44e3-43f3-906e-bfe74354c964',
   '463f9428-6283-4558-95ca-cdad3fd25ab4',
   '4742bcc4-c17b-44fb-8623-266a6f262e8b',
   '48f727e1-acde-44e0-ba2e-0d7a7748e2c0',
   '4fb63989-cc7e-4526-aa2f-b6b29983c170',
   '53f58ee5-3345-48aa-af08-8637531cd997',
   '56bfdd3e-9353-4fba-818f-185fc4b01b87',
   '5b87dc57-1735-4381-8836-e572a931ddea',
   '67cc9af0-b163-4bc1-889c-6d0edf5debc3',
   '7079f0bf-91be-4480-b7e8-6fada86fe74d',
   '7173e369-a12a-4e39-87cb-12002ec849d3',
   '720bd1df-3957-411e-a742-1764c478775d',
   '7cd8afe4-6cd1-45ff-b5c0-9e5d92480acc',
   '81366e8b-9ca3-4d2f-a442-806ff023338d',
   '8569618f-ea2b-4391-bd0a-0edccd17a958',
   '8cbc7883-afa8-4b7d-a5bf-0a5f9feb587c',
   '8d2ee53c-9645-403b-9be3-6be5d100576b',
   '957fe3b5-21df-4f5b-b738-b1f03e9384f7',
   '9768caed-19e5-43f0-bcb8-9723f5613605',
   '9f6dd395-fa7e-47b7-a0ac-538dcd69c9f9',
   'a53a4aa6-11f7-4f0e-9dcf-16449d7931eb',
   'b2f228aa-7650-4c2a-a753-4fc5e4a5910d',
   'babd80ba-2036-48f5-b2ce-63c156a231c9',
   'c1c476de-c829-437f-a589-454cf6d14960',
   'c687afb1-896b-40b3-b233-336b8f7e895d',
   'c8fa8739-e9bd-4583-85b5-0869129ec6d7',
   'cb3a69dd-bf80-4a7c-bba9-0ce9a7fcd13a',
   'd2fe690e-6c10-48d1-88b1-a41b91f55d0d',
   'd3a4fbed-7966-448e-82e0-da74d29f54e1',
   'd448ca8e-95b4-48a9-af4a-e159bcd37be7',
   'd829f0f9-f914-4443-aedb-803e1a215103',
   'df20a8bd-5cb5-48c0-9364-39d2d74fd9b7',
   'ec14224a-7e93-4806-a9ea-ba45629820de',
   'f08e532e-b320-4a20-8000-6701f2e9697f',
   'f4ee07a3-7c79-45ba-b204-0bebdfec5ec2',
   'fb84b058-afed-4f07-bdb1-fb699cc8e14c',
   'fc08c771-7fa3-4b74-9e6b-edf7b57130a8',
   'fc25fd7b-d26e-419a-b216-2a416cdacb55'
 );

-- → AY 23-24 SUMMER 2024  (2024-05-06 → 2024-08-25) · 32 nota(s): 32 por vecindad, 0 por ingreso
--   ej: Emilia Gurza Barrios         Nutritional Planning Appli aula 398   · por sus otras 1 nota(s) fechadas
--   ej: Alden Xavier Haslam Cuadra   Specialized Sports Nutriti aula 399   · por sus otras 1 nota(s) fechadas
--   ej: Gonzalo Alonso Luna Vigodsky Nutrition for Health and N aula 438   · por sus otras 1 nota(s) fechadas
--   ej: Emilia Gurza Barrios         Nutrition for Health and N aula 438   · por sus otras 1 nota(s) fechadas
update academic_grades set semester_id = 'f486ea73-cb8c-4b7a-ba3f-43c30ebccebe'
 where semester_id is null and external_id in (
   '034b98ef-b716-4687-a47b-bcb35822034b',
   '08cb45c9-69d9-4b1b-9193-e8fd7c1d1258',
   '0c1fd436-4c48-4bf0-88c4-03ca203d32b1',
   '0eb854ec-9407-4806-a4d5-eefd68cd1763',
   '1051e823-1615-4e0f-9ed7-b1ee26c3e2ec',
   '110c3d8f-4b76-4b56-ac8a-18fa4abca769',
   '267c1d1f-1475-4a39-a473-ff335300a16b',
   '2d5725db-00e7-4e97-a634-6ca083dd0ee5',
   '6f388725-3f73-430f-b700-681bc8bb6f1f',
   '73b7a90b-43a5-4883-91bd-a1c2ca626448',
   '76be826a-1280-4e13-afc5-682c2a42d9df',
   '7d37d15d-9c38-497e-9635-6446c2e48e19',
   '8d3d34fe-8d13-43ba-8f48-5382ac76c82d',
   '95df1de2-b821-4ddd-9d94-4b3a3b345327',
   '9751a9c0-059f-45d3-904e-3a0ffe3429eb',
   '9c2664d9-a7b4-411f-a1ad-72e00927d54c',
   '9ef2bf33-f1b1-4548-a170-a38eabdfd2c6',
   'ab6eedf8-5318-41bc-ae23-e9c9cf19416f',
   'b98af8e5-c1f1-45bd-80c5-1eaf14a20978',
   'bebfa73b-f93c-487f-b3c4-c14bd2c38673',
   'c8cff102-a406-49de-9257-15f23cf7d8a5',
   'c8f7a30c-ce0e-4a98-90ed-f31fb011d1cc',
   'd43b2477-154c-419b-9482-5b788a0b511e',
   'd5ab7325-3856-49b7-9a5c-ab902055181f',
   'd726a0bf-7baa-4459-80d3-513bedb0aba8',
   'dd0fef8b-2160-4ccb-9dec-9b8534670a5c',
   'e76cb0f0-4d63-4220-bd25-c4d640d64b21',
   'e868e994-f115-47d3-b5ec-5551882df6c4',
   'efe277b8-aa9d-4722-9aba-369105187e60',
   'f02a3fb7-8eb3-400c-a206-eb3bad9f8e1c',
   'f2f24f27-ca5e-440f-a21b-991cffcda82d',
   'f8a96b12-ac7c-428a-a5a9-721287813b87'
 );

-- → AY 25-26 SPRING 2026  (2025-12-29 → 2026-04-26) · 30 nota(s): 21 por vecindad, 9 por ingreso
--   ej: Álvaro Rincón Céspedes       Regulatory Framework and S aula 665   · por el semestre en curso al matricularse (2026-01-19)
--   ej: Álvaro Rincón Céspedes       Analysis of Environmental, aula 666   · por el semestre en curso al matricularse (2026-01-19)
--   ej: Álvaro Rincón Céspedes       ESG Performance Audit, Mon aula 667   · por el semestre en curso al matricularse (2026-01-19)
--   ej: Daiana Elodina Souza Montero Introduction to Coaching   aula 566   · por sus otras 1 nota(s) fechadas
update academic_grades set semester_id = '5161ae68-20ef-4fd5-b730-133c2b453823'
 where semester_id is null and external_id in (
   '019bd805-7e33-7432-94ab-31375d9ee426',
   '019bd805-7e9f-77bc-8ebd-8403cd86bc56',
   '019bd805-7eb8-786f-874f-d337cbbc0934',
   '019bd82d-c3a8-7113-af02-0ba17870f6b2',
   '019bd82d-c3c5-7a54-9dda-1385f132eb16',
   '019bd831-6d42-7ac3-852e-d734f685e1a7',
   '019bd831-6d5b-76c1-b715-c25d2ee0a14f',
   '019bd831-6d79-7aa5-be3a-51eb9d30b98a',
   '019bd831-6da1-7841-9afe-0ed7c7c33247',
   '019bd839-ab57-7c6a-a5e0-daf17d00b35a',
   '019be286-62d6-7491-b283-d94c4c9531ae',
   '019be286-630a-7af8-8b98-9ef995aaec91',
   '019c6c8b-a3ef-74c8-bfd7-2bbba161e9ea',
   '019c6c8b-a40f-7331-b98f-8f573417dc6e',
   '019c6c8b-a430-7398-94a3-559902913474',
   '019c6c8b-a448-7582-82cf-cc7f4ee8ade5',
   '019c6c95-b6b7-76fa-8a0d-c2e818025abe',
   '019c7283-dffc-7bfa-9267-de36fc2f8a14',
   '019c7795-c3f1-7624-98c3-70023556b4b9',
   '019cfc2f-15ad-7f96-8e3e-b190d043d882',
   '019cfc2f-15b7-7b28-afea-bf9d1397fb2c',
   '019cfc2f-15eb-7711-a4ec-d7bbeae12356',
   '019cfc2f-1624-793f-8dad-7595a431d7ef',
   '019cfc2f-1626-704f-84b0-8a120180f4b7',
   '019d0295-f093-706b-a209-99965150c877',
   '019d0295-f0b8-73a1-9bd2-298018a6ad71',
   '019d0295-f0de-755f-8ecd-6188a4dee3ef',
   '019d8c74-cf36-7d8b-9f04-bbca4d26ed90',
   '31c63d5c-2e1f-4407-bdb4-edfa0f48e752',
   'c7fe5ec7-acfe-47e0-ad0c-ad7538da234b'
 );

-- → AY 25-26 SUMMER 2026  (2026-04-27 → 2026-08-23) · 28 nota(s): 25 por vecindad, 3 por ingreso
--   ej: Mia Brianna Camaticona  Pera English Composition I      aula 711   · por sus otras 9 nota(s) fechadas
--   ej: María Renata Cobeña  Mera    Nutrition for Health and N aula 438   · por sus otras 4 nota(s) fechadas
--   ej: Eduil Andrés Castro  Gonzále Nutrients, Hydration, and  aula 397   · por sus otras 1 nota(s) fechadas
--   ej: Eduil Andrés Castro  Gonzále Specialized Sports Nutriti aula 399   · por sus otras 1 nota(s) fechadas
update academic_grades set semester_id = '92d1996e-dcde-4ec5-9049-bbcae76f8781'
 where semester_id is null and external_id in (
   '019e60f5-d349-7d87-ba07-bda8293125b9',
   '019eb7d9-fd70-7fc0-817d-c07762b7cf38',
   '019eb7db-d250-7593-a171-60420e0f957f',
   '019eb7db-d29d-719a-b99d-bd6af08a9ac7',
   '019eb7db-d2c1-7926-b349-77990bb514fd',
   '019eb7db-d2e7-730e-a161-8ea0e6b9098c',
   '019f1568-1a40-78af-944b-75f10aa189f8',
   '019f2975-7119-7da5-9ced-9f8db1a97f17',
   '019f2977-46a8-78ee-93f2-8f164605460d',
   '019f3981-1e54-7fe8-a9e8-ece413e39702',
   '019f3981-1e71-7395-ab38-ceca3f0fe036',
   '019f3981-1e8b-797e-9a6c-603e0ad8fa79',
   '019f3984-c8f3-7dc4-97a5-619680383614',
   '019f3984-c964-7f34-b21f-214dcb6048d8',
   '019f3986-1f1c-7204-a7ce-18dc88499377',
   '2a372c03-4ee6-4a68-b173-4c7c0d454abb',
   '3c57f2ae-7ed8-442f-ba0c-6e744fee4782',
   '46e1dade-0f12-4cd8-a7f6-3f1a1f76e4a5',
   '47fae979-1b88-40e4-bef8-ca72a698aec9',
   '4e4f4e7d-f257-4bcc-b8e0-218dd915f36a',
   '5c9afd9c-2347-4154-9f8d-08c379528365',
   '6ad34a2a-27c8-4bf1-b9c6-8ccc5deb81bf',
   'a56b502a-e4f3-4386-9bcf-463643f350d2',
   'c0947e89-d46e-423b-ac49-a4ea453d8c88',
   'c7ddf715-3eaf-4757-a49e-40d5644cb20c',
   'd372580e-8841-42f4-bd2c-72877ba43b65',
   'd49a1f6e-5780-4da8-9f82-1c6d20c66836',
   'fa75a1a1-ecdf-4fe6-b9eb-592840fc794c'
 );

-- → AY 23-24 SPRING 2024  (2024-01-01 → 2024-04-28) · 3 nota(s): 3 por vecindad, 0 por ingreso
--   ej: Erica Yudit Arisaca Mamani   English Composition I      aula 731   · por sus otras 21 nota(s) fechadas
--   ej: Liliana Lisseth Reyes Gutier Management Information Sys aula 186   · por sus otras 29 nota(s) fechadas
--   ej: Jose Antonio Flores Bernaola English Composition II     aula 712   · por sus otras 19 nota(s) fechadas
update academic_grades set semester_id = 'f1ca6e00-6dca-4313-912b-101037d76c95'
 where semester_id is null and external_id in (
   '05305395-0b71-42f6-b4d8-48b8da1be5eb',
   '478f0296-f134-4e7a-8c03-1a7ccc7a8b51',
   'b8f526f7-5bb1-452b-a2e5-0381a4b3f8f0'
 );

-- → AY 23-24 FALL 2023  (2023-09-04 → 2023-12-24) · 1 nota(s): 1 por vecindad, 0 por ingreso
--   ej: Irma Rebeca Chocce Perez     English Composition I      aula 731   · por sus otras 20 nota(s) fechadas
update academic_grades set semester_id = 'c57b0493-2484-4c51-9777-0b918dcde970'
 where semester_id is null and external_id in (
   '0cbc31a4-6ec0-4c5f-9fd1-142253df954a'
 );

-- PASO 3 · Después
select count(*) as sin_semestre
  from academic_grades
 where source = 'moodle' and withdrawn_at is null and semester_id is null;
-- Debe devolver 4.

-- PASO 4 · El invariante
select count(*) as en_semestre_cerrado
  from academic_grades g
  join academic_students st on st.document_number = g.document_number
  join academic_courses c on c.id = g.course_id
  join academic_student_enrollments e on e.student_id = st.id and e.program_id = c.program_id
  join academic_semesters s on s.id = g.semester_id
 where g.source = 'moodle' and g.withdrawn_at is null
   and s.end_date < e.enrollment_date::date;
-- Debe devolver 0.

