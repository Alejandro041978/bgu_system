-- ---------------------------------------------------------------------------
-- Las notas de Moodle que no contaban en el acta de nadie.
--
-- 121 notas importadas de Moodle se quedaron sin asignatura de la malla
-- (course_id en null). Entraron cuando su aula todavía no estaba vinculada, y
-- al vincularla después nadie volvió a mirar lo que ya había entrado. Tienen
-- aula, tienen calificación, y el expediente no las ve.
--
-- No son huérfanas sueltas: 120 de las 121 conviven con otra fila del mismo
-- estudiante y la misma asignatura, importada de SystemActiva. Son la misma
-- inscripción vista dos veces. El Acta Personal se queda con la mejor de las
-- filas, así que enlazarlas no duplica nada: hace que la nota de Moodle
-- compita, que es justo lo que hoy no puede hacer.
--
-- Se enlazan 103 de las 121:
--       1  casilla libre, no hay con quién comparar
--      57  coinciden con la de SystemActiva (menos de medio punto)
--      13  la de SystemActiva está en cero o vacía
--      32  Moodle acumuló más que el cierre de SystemActiva
--
-- Quedan FUERA las 18 en que SystemActiva es mejor que Moodle. Ahí el
-- acumulado de Moodle puede ser un curso a medias en vez de una nota baja, y
-- decidirlo por "la mayor gana" sería aplicar la regla del recursado a algo que
-- no es un recursado. Esas las revisa Dirección una por una.
--
-- El disparador de protección se desactiva porque 20 de estas filas tienen el
-- acta cerrada. No se toca ninguna calificación: solo se dice a qué asignatura
-- pertenece cada nota, y el destino sale del vínculo vigente de su aula.
-- ---------------------------------------------------------------------------

begin;

alter table public.academic_grades disable trigger protect_edited_grades_trg;

with destino(external_id, course_id) as (values
  ('bc3ef8d8-723e-48ff-ad54-ae069a97551a'::uuid, 'c50b0332-2e69-48b3-8c6c-3e75ec4f5c5b'::uuid),
  ('b88dbbb9-db79-4816-ad00-cefda88fac81'::uuid, '8a94b06c-bc7a-4da3-8f30-c483018d1504'::uuid),
  ('eccef2e9-64c4-4b80-a654-a2cb3db67ad8'::uuid, '8a94b06c-bc7a-4da3-8f30-c483018d1504'::uuid),
  ('8016cfa7-c913-4ce1-a7c1-f8565aec6ac5'::uuid, 'dfb39a53-698d-49b4-8e52-f5deb6cc81fd'::uuid),
  ('0a924b51-9eea-4316-a7f3-e60004be2b2d'::uuid, 'c50b0332-2e69-48b3-8c6c-3e75ec4f5c5b'::uuid),
  ('f3df25be-966f-4e76-af65-82edf642f39f'::uuid, 'c50b0332-2e69-48b3-8c6c-3e75ec4f5c5b'::uuid),
  ('7b1c4a1f-575c-49da-af3d-8b3008c17b60'::uuid, '8a94b06c-bc7a-4da3-8f30-c483018d1504'::uuid),
  ('43167902-12f3-45e5-ad41-ce890430351b'::uuid, '7e9e7e0f-aca7-4f79-8680-cb229abf0e43'::uuid),
  ('540ba2fa-8eff-4051-ae35-cf6aeb7d864a'::uuid, '7e9e7e0f-aca7-4f79-8680-cb229abf0e43'::uuid),
  ('06ea3c30-614a-4fe4-a94f-0265a412705b'::uuid, 'cdadc657-fbe3-4fc0-8785-1ba938116a43'::uuid),
  ('58d9d882-22ac-4d5f-a06e-f504a08662ed'::uuid, 'cdadc657-fbe3-4fc0-8785-1ba938116a43'::uuid),
  ('7147d2c1-5adf-4722-ae5d-15e74ea16143'::uuid, 'cdadc657-fbe3-4fc0-8785-1ba938116a43'::uuid),
  ('a4e93354-56fa-458e-aedf-6e5952252251'::uuid, 'cdadc657-fbe3-4fc0-8785-1ba938116a43'::uuid),
  ('a5f6f284-e69c-41a1-aaea-159d3678f465'::uuid, 'cdadc657-fbe3-4fc0-8785-1ba938116a43'::uuid),
  ('cbb8b53c-09cd-48a5-aada-7facc4b54576'::uuid, 'cdadc657-fbe3-4fc0-8785-1ba938116a43'::uuid),
  ('9df6f987-965f-433c-aacc-46762341c62c'::uuid, '2ae467c6-5507-4137-9ba2-4f92a8a9d2b3'::uuid),
  ('b8acfd0b-ab52-421b-ae44-54b1cbadc9b7'::uuid, '2ae467c6-5507-4137-9ba2-4f92a8a9d2b3'::uuid),
  ('048be9d7-8d14-42c6-a431-e8f75cd5332a'::uuid, 'abbe9fb0-bd1e-4270-8990-0825584f9c26'::uuid),
  ('82bef3cc-6a39-477e-a1fd-537b1d226125'::uuid, 'abbe9fb0-bd1e-4270-8990-0825584f9c26'::uuid),
  ('18687757-61ab-499d-a4f8-282e01317eea'::uuid, '35f68af3-5c13-437e-86e8-efb33875d2d7'::uuid),
  ('7ae10edc-0545-47d0-a43f-09870964c5c2'::uuid, '35f68af3-5c13-437e-86e8-efb33875d2d7'::uuid),
  ('e30dea25-f391-48cc-a5a7-95d48017a265'::uuid, 'e3942e38-2775-435e-8160-ad1a94d7a7ae'::uuid),
  ('527de40d-5040-453b-a6f5-3c1fb13dc95c'::uuid, 'e2a48048-9d94-4fee-aaef-f8ab848960fa'::uuid),
  ('e401068e-8d47-482b-ad2e-0db055b5839e'::uuid, '2b69690d-3b7e-4f58-be7b-d198764f8ab5'::uuid),
  ('2cbb9477-e038-425f-a64f-7582bd0214a2'::uuid, 'e638605f-e5a3-42c7-aa1d-6c3bf74b1675'::uuid),
  ('c3461499-8222-4425-af97-de9dddf909a8'::uuid, 'a0e5d214-0afb-4461-9ff9-4c05ecd09f09'::uuid),
  ('d1137271-0972-4680-a48f-3d7f078c92a7'::uuid, '7ee52d5b-2ea3-4a8c-8572-a72f40b23fe6'::uuid),
  ('4de7c587-dae7-4dc0-ad4a-141be81b0971'::uuid, '7ee52d5b-2ea3-4a8c-8572-a72f40b23fe6'::uuid),
  ('444711aa-6ac2-4f17-ae60-02688e92ca93'::uuid, '7ee52d5b-2ea3-4a8c-8572-a72f40b23fe6'::uuid),
  ('4e7ede4b-fe49-4090-a1ad-2d1af624a99c'::uuid, '73a16dee-0552-48ec-bc9e-133fedc5872b'::uuid),
  ('1c47bacb-0bfd-4612-a84f-794a43f3bc48'::uuid, 'abbe9fb0-bd1e-4270-8990-0825584f9c26'::uuid),
  ('4e29b8dc-9310-4de5-af96-b76838677f5e'::uuid, '3743fecc-991e-4149-a5f9-77b307f2b570'::uuid),
  ('84d6f270-0690-4a20-ab98-e0b3bfb9e829'::uuid, '3743fecc-991e-4149-a5f9-77b307f2b570'::uuid),
  ('8301a9a5-bbc9-4400-a61d-321aadb311e0'::uuid, '3743fecc-991e-4149-a5f9-77b307f2b570'::uuid),
  ('6ffffd61-66a1-43b6-aa00-7232abf71474'::uuid, '3743fecc-991e-4149-a5f9-77b307f2b570'::uuid),
  ('a49b75e3-2b7c-4a66-a4c3-663f872eb638'::uuid, 'eaa82ea3-4b21-401e-96ba-2c39b3825b77'::uuid),
  ('22a66f97-73f6-43d5-ade2-a3735c57039f'::uuid, 'eaa82ea3-4b21-401e-96ba-2c39b3825b77'::uuid),
  ('350485ce-1b58-4987-a69f-0f62448ac535'::uuid, '1524b2ce-8549-4d93-9c05-a2d37ab1131f'::uuid),
  ('216bbcc3-0b9c-4df5-a2f6-80e5c51f2700'::uuid, '1524b2ce-8549-4d93-9c05-a2d37ab1131f'::uuid),
  ('20237131-c3de-4565-a1b4-60a402025f03'::uuid, '1524b2ce-8549-4d93-9c05-a2d37ab1131f'::uuid),
  ('28cb5152-c47e-4c7e-aeb1-bb6f9b496df8'::uuid, 'e3942e38-2775-435e-8160-ad1a94d7a7ae'::uuid),
  ('51023f98-6e15-4082-a02b-d8b27e85cb20'::uuid, '3743fecc-991e-4149-a5f9-77b307f2b570'::uuid),
  ('0fad5f6a-0df6-4cc4-ae17-114a084988c1'::uuid, '73a16dee-0552-48ec-bc9e-133fedc5872b'::uuid),
  ('9d92f98e-3dab-4828-adb6-30d3beed9d1c'::uuid, '153bda06-79d3-42ae-9808-1ff4873d2cf1'::uuid),
  ('6ad16226-c28c-4ac0-a7a2-a0520af1b547'::uuid, '153bda06-79d3-42ae-9808-1ff4873d2cf1'::uuid),
  ('072962bb-9913-4463-a86b-783a29bfd823'::uuid, 'a16163b3-9f9e-4e8e-bab4-2e8087c9a3b8'::uuid),
  ('5a75ac9d-8817-40fc-a9ed-916dcd24344b'::uuid, 'df844dc2-bc76-4d7a-b195-dffe29a552cf'::uuid),
  ('fa586971-c4bd-4298-a8be-4cf9c7cdc3ee'::uuid, '3743fecc-991e-4149-a5f9-77b307f2b570'::uuid),
  ('747cd2a1-a9cb-418e-a6c4-204d2b527306'::uuid, '3743fecc-991e-4149-a5f9-77b307f2b570'::uuid),
  ('61c64abe-7c49-48d7-a514-0457c019acfa'::uuid, 'c031b577-e942-4dd3-ac8b-406cddce8057'::uuid),
  ('846da3f3-577a-4231-af9c-e88830e46d7d'::uuid, '2ae467c6-5507-4137-9ba2-4f92a8a9d2b3'::uuid),
  ('13b5cf85-fd69-4f69-a9ff-1baf2e782d2f'::uuid, '2ae467c6-5507-4137-9ba2-4f92a8a9d2b3'::uuid),
  ('977b98ca-dbce-4654-adc4-232d2f468051'::uuid, '2ae467c6-5507-4137-9ba2-4f92a8a9d2b3'::uuid),
  ('d3ac0976-8b2f-4116-af9e-420ea939be40'::uuid, 'd597e785-153e-451f-995e-a408902a74b2'::uuid),
  ('16950cb4-fb27-4bc3-ac2f-39861b908292'::uuid, 'cdadc657-fbe3-4fc0-8785-1ba938116a43'::uuid),
  ('07d243df-3c78-4472-a3ff-d141aa6d5ec8'::uuid, 'a16163b3-9f9e-4e8e-bab4-2e8087c9a3b8'::uuid),
  ('7b3a2763-b92a-4575-a3cb-a3fdbb792abe'::uuid, 'd597e785-153e-451f-995e-a408902a74b2'::uuid),
  ('cf59aeac-c1c7-4dd2-a503-dd3f3a4e212f'::uuid, 'c031b577-e942-4dd3-ac8b-406cddce8057'::uuid),
  ('2424fda9-7c94-4aeb-a608-850b64428502'::uuid, 'dfb39a53-698d-49b4-8e52-f5deb6cc81fd'::uuid),
  ('9d3aab98-dc55-4f60-a80d-ae5b343aa6de'::uuid, 'e3942e38-2775-435e-8160-ad1a94d7a7ae'::uuid),
  ('9588ea60-50bb-4525-a939-5574927ea7aa'::uuid, '8f62fb78-59ff-4af3-8e39-eab062f9edb1'::uuid),
  ('c4e5802f-aac6-4caf-a91a-7285300d7405'::uuid, 'caa5c139-b0b1-4244-9fd2-7e95bfde7898'::uuid),
  ('c5fb6617-f9e6-4c0f-ac5b-5ca963fe5f94'::uuid, '35d8ac99-7bad-44b1-bf03-2f7188dc3fd6'::uuid),
  ('c76d1404-c856-4e43-ae79-d185bc2d3a4b'::uuid, '7ee52d5b-2ea3-4a8c-8572-a72f40b23fe6'::uuid),
  ('1696ea9b-e92b-4450-ad01-643e783b9ac6'::uuid, '7ee52d5b-2ea3-4a8c-8572-a72f40b23fe6'::uuid),
  ('7318ccd7-10bd-4cb1-a498-877beadd6c9b'::uuid, 'a0e5d214-0afb-4461-9ff9-4c05ecd09f09'::uuid),
  ('4ef79578-a4a7-43cc-a973-744df7467b99'::uuid, 'a0e5d214-0afb-4461-9ff9-4c05ecd09f09'::uuid),
  ('966094b2-bc85-4885-acd8-50114d148c77'::uuid, '37aa52a9-ec98-4252-9f2a-0b368f6745cb'::uuid),
  ('0ef9c961-49d2-46bb-a361-53e0e96a54c5'::uuid, 'db238f55-4364-429c-ac75-eeeff62db4e5'::uuid),
  ('7a8398a8-e605-4af7-ad61-4537ec75e537'::uuid, '980f7a9b-01fb-4a29-912d-4dcb52a9fea2'::uuid),
  ('cfd2f135-5c78-401a-a017-765d7652e9d0'::uuid, '301e7b7a-6bba-4003-9fe0-0c9df3c3ee79'::uuid),
  ('54793cc6-4df4-4b60-ae5b-4579ea80e057'::uuid, 'dcf5ba70-93d4-4c6e-80b2-5c89864c20ea'::uuid),
  ('055a6c31-3aa7-4618-a04f-b53551331c48'::uuid, 'ffe58be6-e320-4f1d-97df-10085e373286'::uuid),
  ('dfe82491-2edf-4455-aad0-4a3ac73aa3bf'::uuid, 'bb39f47b-bf23-4b79-ae58-d598c633287c'::uuid),
  ('cfa30c25-69a5-4706-a99f-277a227123ff'::uuid, '8a94b06c-bc7a-4da3-8f30-c483018d1504'::uuid),
  ('67c83617-ec98-4823-a624-a61c7b077644'::uuid, 'e3942e38-2775-435e-8160-ad1a94d7a7ae'::uuid),
  ('6d785cfe-41b7-4297-ad64-779965532d5e'::uuid, 'b43e9b1b-dc38-4a79-9b21-107d77aa436a'::uuid),
  ('965cb031-149f-4891-a993-eea100381861'::uuid, 'a0e5d214-0afb-4461-9ff9-4c05ecd09f09'::uuid),
  ('91ea95f3-4ad6-4f22-ae63-3ee6a9200cc8'::uuid, '7ee52d5b-2ea3-4a8c-8572-a72f40b23fe6'::uuid),
  ('9d5411bc-096b-45d8-a910-c8b30d08748a'::uuid, 'eaa82ea3-4b21-401e-96ba-2c39b3825b77'::uuid),
  ('9db43646-f02c-459e-a8b7-e2ae2fee6081'::uuid, 'abbe9fb0-bd1e-4270-8990-0825584f9c26'::uuid),
  ('776f903e-8fc9-486d-a34a-0d23e1a2c665'::uuid, '3a010d5d-47a4-4f9d-9a16-2c9e10546d04'::uuid),
  ('312957d1-6c5e-4f58-ab68-03a32f35501b'::uuid, '36374023-4151-4273-9a8f-8901ca282d2d'::uuid),
  ('55d65b71-216e-4c7f-a593-ee10790773d4'::uuid, '3743fecc-991e-4149-a5f9-77b307f2b570'::uuid),
  ('83d3afbf-cc15-472c-a92c-5b6c371d05d5'::uuid, '1524b2ce-8549-4d93-9c05-a2d37ab1131f'::uuid),
  ('643db080-ff1e-49b1-ada7-cb9919880277'::uuid, 'eaa82ea3-4b21-401e-96ba-2c39b3825b77'::uuid),
  ('22a52c91-7f4e-440a-ad72-9ccb308667c7'::uuid, '37aa52a9-ec98-4252-9f2a-0b368f6745cb'::uuid),
  ('d7946478-08da-4302-aa53-e7e9eade8bfb'::uuid, '8a94b06c-bc7a-4da3-8f30-c483018d1504'::uuid),
  ('8180f8c4-9392-4375-ae72-6e32cb102909'::uuid, '8a94b06c-bc7a-4da3-8f30-c483018d1504'::uuid),
  ('e31d189d-7f71-4590-a9f4-60aab886c192'::uuid, '1674e871-0b8b-49a4-94b7-0e3b7c5307be'::uuid),
  ('dad9766d-0676-4eb2-a52a-72aec3d03ad7'::uuid, '1674e871-0b8b-49a4-94b7-0e3b7c5307be'::uuid),
  ('d5c946af-ad03-42a6-a541-ad947d2164f9'::uuid, 'd3e4783d-4a92-48ff-8282-6fc0931278a8'::uuid),
  ('9eb457b7-bfb8-4a12-a857-287f832aa155'::uuid, 'd3e4783d-4a92-48ff-8282-6fc0931278a8'::uuid),
  ('e5637741-926b-474c-abd1-d86d2536cee6'::uuid, 'bf45bac6-8714-44f8-8fc6-981992770711'::uuid),
  ('7d916b45-7616-4e09-a8a9-cc97fe287c8a'::uuid, 'bf45bac6-8714-44f8-8fc6-981992770711'::uuid),
  ('4ddd643f-2749-4efd-a006-3ddd0324c4b9'::uuid, 'bf45bac6-8714-44f8-8fc6-981992770711'::uuid),
  ('af57e0fa-54d5-4062-a3da-6c9908787518'::uuid, 'd3e4783d-4a92-48ff-8282-6fc0931278a8'::uuid),
  ('a27596d4-88ba-4f9b-a165-56f027ee54fd'::uuid, 'd3e4783d-4a92-48ff-8282-6fc0931278a8'::uuid),
  ('27bd023c-c49d-4dc2-a9c4-3072f7234e2e'::uuid, 'f79b29bd-3930-43cc-9633-d0ec37de47f8'::uuid),
  ('202e65c8-718a-4a23-a444-1740ed74fc52'::uuid, 'a16163b3-9f9e-4e8e-bab4-2e8087c9a3b8'::uuid),
  ('2510f39b-391e-4a33-a9d8-ca35f60630da'::uuid, 'd3e4783d-4a92-48ff-8282-6fc0931278a8'::uuid),
  ('6dfca52e-d6e7-4131-a73a-308e3284f9b2'::uuid, 'd3e4783d-4a92-48ff-8282-6fc0931278a8'::uuid),
  ('6cf712ce-77cf-4989-ac8d-e33df56be9d1'::uuid, '1674e871-0b8b-49a4-94b7-0e3b7c5307be'::uuid)
)
update public.academic_grades g
   set course_id = d.course_id
  from destino d
 where g.external_id = d.external_id
   and g.course_id is null;

alter table public.academic_grades enable trigger protect_edited_grades_trg;

commit;

-- Verificación: debe quedar en 18 (las que esperan decisión).
select count(*) as notas_de_moodle_sin_asignatura
  from public.academic_grades
 where moodle_course_id is not null
   and course_id is null;
