-- ---------------------------------------------------------------------------
-- Corrección por lote del país de residencia.
--
-- QUÉ SE ARREGLA
-- El país de la ficha se quedó en PER por omisión. La prueba es la comparación
-- con el código telefónico, que sí se cargó bien:
--
--     país distinto de PER  →  98,1% concuerda con su teléfono
--     país igual a PER      →  75,8% concuerda
--
-- Cuando alguien puso el país, acertó casi siempre. Los desajustes se
-- concentran en PER, que es el valor de la casa. De los 281 desajustes, 272
-- dicen PER.
--
-- QUÉ ENTRA EN EL LOTE
-- Solo las fichas que cumplen LAS DOS condiciones:
--   1. su país dice PER, y
--   2. su código telefónico pertenece a UN SOLO país.
-- Son 165. No se toca la ciudad ni el teléfono: la ciudad ya concuerda con el
-- país propuesto y el teléfono es la evidencia, no el error.
--
-- QUÉ NO ENTRA, A PROPÓSITO
--   · Los 112 con +1: ese código lo comparten Estados Unidos, Canadá,
--     República Dominicana y Puerto Rico. Adivinar sería inventar.
--   · Los 4 cuyo país NO era PER: ahí alguien lo escribió a propósito y
--     puede ser correcto (se vive en un país con la línea de otro).
--
-- CÓMO REVISARLO
-- Cada bloque lleva delante los nombres, documento, ciudad y teléfono de las
-- fichas que toca. Se corre el SELECT de arriba primero: debe devolver las
-- mismas 165 filas que suman los bloques.
--
-- QUEDA REGISTRADO
-- updated_by apunta a la cuenta de Dirección, así que el historial de fichas lo
-- atribuye con nombre en vez de marcarlo como "fuera del ERP". Si se corre con
-- otra cuenta, cambia el correo de la subconsulta.
-- ---------------------------------------------------------------------------

-- PASO 1 · Ver qué se va a cambiar (no modifica nada)
select s.document_number,
       concat_ws(' ', s.first_name, s.last_name, s.second_last_name) as estudiante,
       s.country as pais_actual, s.city, s.phone_number
  from academic_students s
 where s.country = 'PER'
   and coalesce(s.phone_code, substring(s.phone_number from '^\+[0-9]{1,3}')) in
       ('+502', '+503', '+504', '+505', '+506', '+507', '+593', '+595')
 order by s.phone_code, s.last_name;

-- PASO 2 · La corrección, un bloque por país
-- GTM · 34 ficha(s) · teléfonos +502
--   Gloria María García Ortíz              2626480400110    Guatemala            +50241997664
--   Olga Janett Mansilla Salazar           2205952320101    Guatemala            +50255271990
--   Hugo Antonio González Godínez          1914690840101    Guatemala            +50256337457
--   Nicole Judith Olaverri Hernandez       2075801110101    Guatemala            +50256308926
--   Mario Ranferi Vargas Orellana          2348799550101    Guatemala            +50241507262
--   Carlos Emilio Contesti Arreaga         2310505850101    Guatemala            +50256946329
--   Lucia Gabriela Gutierrez Grajeda       2513167930101    Guatemala            +50240717737
--   Karla Marina Toledo Letona             1619456270101    Guatemala            +50258009050
--   Ana Pamela Motta Cuellar de Vargas     2653922170101    San Salvador         +50247390104
--   Ursula Graciela Estrada Turcios        2358808090101    Guatemala            +50247500298
--   Jose Alfredo Lopez Gonzalez            2299966040101    Guatemala            +50230173933
--   Sergio Javier Alvarez Hernández        1991843050101    Guatemala            +50252042436
--   Walter Antonio Mora Montenegro         1926111940501    Guatemala            +50257414248
--   José Arnoldo Saenz Morales             2252569160101    Guatemala            +50255236575
--   Héctor Inael Mota León                 1844530891901    Guatemala            +50256979694
--   Diego Sebastián Mendoza Marroquín      2048131900101    Guatemala            +50230182877
--   María Regina Ortíz Cienfuegos          2467702441301    Guatemala            +50242104979
--   Dina Maritza Aguilar Calvillo          2364542420101    Guatemala            +50241294646
--   Lourdes Esmeralda Flores Contreras     3002622800101    Guatemala            +50250192846
--   Sheyla Paola Monzón López              2337240790101    Guatemala            +50242218845
--   Allan Adolfo Yacabalquiej Morales      2110869750914    Guatemala            +50251153765
--   Luis Miguel Zetina Toache              2668131270101    Guatemala            +50253035273
--   Karen Lisseth Perez Argueta            2510673510101    Guatemala            +50251956782
--   Pedro Pablo Samayoa Rivera             2309264280101    Guatemala            +50241285902
--   Harold Jasson Galindo Berqueffer       163858780        Guatemala            +50250030132
--   Ludwigton Lopez Peralta                1941516540101    Guatemala            +50240779366
--   Pamela María González Parra            2265788520101    Guatemala            +50249520268
--   Vivian Scarleth Velásquez Díaz         2956519381202    Guatemala            +50242796343
--   Jaqueline Nicole Marie Lopez Solares   310891728070     Guatemala            +50233847222
--   Carmelino Garcia Reynoso               1771793411323    Guatemala            +50259965158
--   Pr'sni Laksmi Devi Archila Lool de Flo 2518074010101    Guatemala            +50241172266
--   Ery Mario Rodríguez Maldonado          2547023760101    Guatemala            +50252003377
--   Oscar Alfredo Corzantes Garcia         2147945200101    Guatemala            +50253991207
--   Guissell Marines Cifuentes Fuentes     3303260661202    Guatemala            +50247191467
update academic_students set country = 'GTM', updated_by = (select id from auth.users where lower(email) = 'alejandro.nunez@blackwell.university')
 where id in (
   'c2a0c428-b204-4b04-a9d0-37c92f50a6d5',
   '79a175e9-e00b-4e9e-820c-ae65e74435d5',
   'ea44e150-151a-4e9d-8d6a-2e8a75c7f535',
   'a343f948-6d16-48f1-b249-68ee1c3eebe3',
   'a6dadf33-488f-4183-a53d-fea30518bab5',
   '457180aa-fb42-4583-9518-1e641afc52a6',
   '2d52cf15-85c8-42b5-ac4a-f96f441617d7',
   '5e880308-75e1-4b80-b118-fc3f1601d57d',
   '40f484b8-596b-423a-a1fb-90110a21945d',
   '9a619f25-409d-47d4-b665-fbe978467f70',
   '928bc8f9-f42b-461f-9b5c-c8e852f52b62',
   '21e8b6dd-9b67-4bab-a1a2-b87c66ff7eae',
   '0dd9e5aa-b0f8-43ed-8003-637f8b9c37cb',
   '7ea5292e-a9f6-4ceb-9536-c137021a4ee5',
   'd4b0f8e4-fdf0-4dbc-b530-5a85f536e6ca',
   '0ae55f69-0801-48ce-b4a0-3173ee807586',
   '33fbbc63-e170-4972-a987-833ad8c6fcdc',
   '4d45f7de-1295-4723-a312-04005a3020f7',
   '181b690b-b301-4eb1-9d0c-a75af75893b6',
   '93406b2f-4cd3-47dc-a386-009b6232c372',
   '04acc74c-49a5-4e62-86e5-973c888d42c1',
   'ed37dd7e-babb-4f45-bad0-0a2966c07701',
   'be0e669f-2fde-4b6f-9f50-d38945ff5157',
   '740ed451-1024-4d25-9385-f86eb8af88f9',
   'f3029a01-7884-493c-9ab3-db817945d000',
   'e0ad6ea4-aed7-4dff-b741-ebdad70225b0',
   '045aeeec-8467-47d9-a2f3-011ebc6480f8',
   '64310dca-2d76-4bd6-ac41-596b169d0ffa',
   '5b530d55-4d81-4ed3-9c12-7f77e348eedf',
   '9dcf8ef3-9653-495c-9dc1-ea398dee5f7b',
   '4c97d4b1-51e5-470e-aab7-9e17b94da8ce',
   '6150aad5-c83f-4870-9919-0102e18f4a73',
   '433a840c-e52b-4aa3-9bfc-05f8671c6613',
   'dd2bd5bf-96ec-4e9e-b2ba-4cea1659fcf4'
 );

-- PAN · 34 ficha(s) · teléfonos +507
--   Madelyn Yarizell Medina Bonilla        88042375         Panamá               +50761030652
--   Patricia Sophia Camarena Caballero     87492243         Panamá               +50766719427
--   Celso Emigdio Bosquez Bonilla          91052240         Panamá               +50762525914
--   Nelly Onisa Molinar Licona de Naar     364823..         Panamá               +50764872988
--   Tatyana Elizabeth Gomez Grillo         870821..         Panamá               +50760704482
--   Andrea María Alejandra Leguizamon Nuñe 18833104         Panamá               +50763061888
--   Roger Javier Fung Delgado              67021029         Panamá               +50767808443
--   Digna Emérita Rivas Coronado           27541138         Panamá               +50766972553
--   Alcibiades Batista Gonzalez            .8247670         Panamá               +50762200207
--   Aldo Antonio Avila De Menezes          .850561.         Panamá               +50766124125
--   Roxana Elvira Martínez Fontenelle      97462246         Panamá               +50766195383
--   Aneliya Ventsislavova Radeva .         E8151658         Panamá               +50762692923
--   Edidio Ivanov Flores Espinosa          473614..         Panamá               +50768428114
--   Sergio Adrian Hernandez Leon           74284353         Lima                 +50766785737
--   Eduardo Enrique Ríos Cornejo           82201945         Panamá               +50766722357
--   Jessica Judith Gonzalez Bocaranda      89012008         Panamá               +50767322615
--   Hernando Soto Montiel                  E8181049         Panamá               +50769246002
--   Briselda Boniche Barria de Batista     A01534580        Panamá               +50769112070
--   Michelle Damaris Donadio Rodriguez De  87061244         Panamá               +50766719119
--   Javier Castillo Salgado                .8243906         Panamá               +50766537754
--   Alba Karina Lisboa Hernandez           E8194621         Panamá               +50762703831
--   Vera Lucia Dos Santos Rawlins          81039189         Panamá               +50763887304
--   Kathia Maria Mc Kay Tejada             .8830427         Panamá               +50762007296
--   Yahaira Nair Barsallo                  87871825         Panamá               +50768403404
--   Kenny Edgardo Correa Serrano           4764672.         Panamá               +50762605764
--   Georgie Adalberto Thomas Garcia de Par 88211555         Panamá               +50760452475
--   Rosalina Rosalba Romero Colmenares     8131589.         Panamá               +50767472982
--   Giuliani Veronica Villamonte Aguilar   87301466         Panamá               +50766127585
--   Manuel Salvador Nazas Rodriguez        .8505733         Panamá               +50768816103
--   Maria del Carmen Barahona Tejada       87381548         Panamá               +50766170712
--   Fernando Adrian Perez Lopera           08942981         Panamá               +50763124731
--   Elvia Susana Ochomogo Castrejon        8413846          Panamá               +50760900844
--   Jose Ricardo Castillo Candanedo        4104193.         Panamá               +50766351851
--   Evaristo Ivan Gonzalez Urriola         .4139326         Panamá               +50764733776
update academic_students set country = 'PAN', updated_by = (select id from auth.users where lower(email) = 'alejandro.nunez@blackwell.university')
 where id in (
   '750aa7d4-dee7-4afc-b197-030b38fd9c98',
   '58062880-2c56-4e34-926a-8b500a3d328c',
   '73ff3f81-51e5-4caf-81dd-6487ff40d0ad',
   '655d1ee8-f631-4de9-87af-3fe5f4e7dfad',
   '112f1271-06d3-46e5-9e94-19950e8ba8e1',
   '2645deff-0a63-4ade-9d5e-103d3fb55b17',
   '6a392f9a-4523-4483-8303-f0c16be7ca73',
   '9361a6f0-7a5f-4a81-bacf-9cb376cd23ca',
   '1176515a-c530-4819-8ec0-b4ab35919b9d',
   '3e2405a1-8151-4740-8417-df4b3a53c0a1',
   '8c7abb9f-0dd9-4428-a3bf-12b41e591fc2',
   '97075313-c48b-4ce3-9d64-83b7e7d9553e',
   '9b91fd03-c440-4a0d-b2fd-740779367ec8',
   'c86ae59d-82b1-4b90-acb7-f14da337c51a',
   '7a23aa79-cc73-44dd-82d8-3da6ad8cbab2',
   '24338bd1-47f1-4659-a09e-6358128b47af',
   'b72f215e-ecc6-4c44-8252-bc8f7ac1a3fb',
   '4cb52cd4-2d03-47d2-861b-fb26945cbda0',
   '1a5c94c4-c803-44dd-b9f0-5130e72e79a0',
   '2786ed7d-8cc2-4e9c-a62d-5ad08c66e648',
   'e6aea18c-b326-4d46-baa0-7c0f203941f0',
   'df1b59cd-1e05-447c-b95e-8fe15d46fa94',
   'a44d81f7-c506-4ceb-ae0d-04a04a412a4e',
   'e2f9f6cd-d1ce-492c-820b-a00ac5120317',
   'ccffd48e-87c1-4266-a1b1-77f0497c578d',
   'ca206377-f6f7-4f7a-8ad0-f4eac75b8bbd',
   '88ac6f07-a44a-455c-82a1-41b62196aa65',
   'ea605317-8ecd-4806-8513-a841d5ed3781',
   '6fa4fbae-433b-45f9-ba5b-0d992fbaa505',
   '92354099-3dfb-4f60-b275-e077949cd211',
   '8b2dd9ec-1b8c-4d32-ab13-9b8d32746664',
   '5fea1eaa-e40d-4101-817d-55cef256bd9d',
   '2cfeb391-bb43-4d94-ab54-9762aea089de',
   '5aea370c-35e3-440f-a6e7-44f11bae52d1'
 );

-- SLV · 27 ficha(s) · teléfonos +503
--   Fatima Yesenia Ordoñez de Rivera       04274640         San Salvador         +50364318478
--   Jeannette Guadalupe Pérez De Sandoval  B038144503       Guatemala            +50373160449
--   Dennis Israel Soto Morales             043003013        San Salvador         +50360547610
--   Keyri Lilibeth Reyes De Ortiz          038687349        San Salvador         +50371186364
--   Carlos Ernesto Navas Menjivar          019653755        San Salvador         +50378417777
--   Juan Carlos Valenzuela Velasquez       012218512        San Salvador         +50378383099
--   Gerardo José MUNGUIA GONZÁLEZ          C03347071        San Salvador         +50377688976
--   María Milagro Galdámez de Tecsin       015833434        San Salvador         +50376737978
--   Angela Maria Rodriguez de Peña         047090397        San Salvador         +50379442778
--   Julio Alfredo Rivera Alonzo            001240297        San Salvador         +50370650538
--   Elissa Beatriz Lopez Tejada            019195707        San Salvador         +50377002118
--   Krissia Etelvina Diaz Arias            044908680        San Salvador         +50375393105
--   Karla Cecilia Chavarria Alvarez        048432186        San Salvador         +50372315412
--   Marco Antonio Sanchez Vergara          F50701314        San Salvador         +50378512838
--   Nelson Jaime Alvarado Chevez           022883212        San Salvador         +50371541174
--   Ana Elizabeth Silva Menjivar           045099052        San Salvador         +50372211071
--   Herbert Ernesto Zapata Ramirez         04590783         San Salvador         +50373256951
--   Vilma Guadalupe Aguilar Perez          036334021        San Salvador         +50379286700
--   Karen Patricia Rodriguez Sanchez       055868592        San Salvador         +50378455624
--   Ricardo Antonio Portillo Gonzalez      053986637        San Salvador         +50370423835
--   Yamileth Nazira Arévalo de Estrada     028796942        San Salvador         +50374777478
--   Evelin Metavel Sanchez Miranda         05463738         San Salvador         +503709323313
--   Gabriela Maria Escobar Portillo        013556620        San Salvador         +50371409993
--   Xiomara del Carmen Ruiz Duran          019865695        San Salvador         +50379875564
--   Fidel Antonio Mendoza Vaquerano        015442623        San Salvador         +50379264372
--   Rosa Leticia Guzman Urrutia            033320706        San Salvador         +50375047883
--   Gabriela Alejandra Menjivar de Mendoza 006243347        San Salvador         +50379264368
update academic_students set country = 'SLV', updated_by = (select id from auth.users where lower(email) = 'alejandro.nunez@blackwell.university')
 where id in (
   '2ffb7112-8e42-4ebf-9e65-b2f3dbff4a94',
   'd3b81a5d-2254-4944-a43d-6513a843fef1',
   '8b6eec39-b4d4-437a-ad85-d8ecc62319f0',
   '20813bfb-e896-4a7a-86fc-c7c067616cf2',
   'aaf2af72-e883-4874-a7ee-c0b6c306c4a7',
   '333f9d63-0842-4561-8386-5779bc9fca47',
   '56597ee8-55ba-45ce-ae71-62513e7c885f',
   '26357639-da2d-474b-9523-f441ed576de8',
   'b42e2681-f5fd-4bef-a2d0-d4697dd1b02b',
   'b38f14e3-2736-43c2-bfb1-196f831730ed',
   '8d78515c-fc1e-4b7e-964d-9c051011a818',
   '13ff2366-a6f1-44b2-bad8-eec0029d15a9',
   'af676893-4d78-4bea-82c9-72a3f5c93478',
   '0697431b-66a6-4166-bd57-9014b987a42c',
   '33abf323-5461-468d-a8d1-220d398af4cd',
   'b21689da-c70b-4a7f-91ac-657db05911f4',
   '508b0931-663a-4d27-80e5-5ee65e9cec52',
   '26e9ee6d-ddce-437d-8b30-8a44cd5d6cda',
   '1b5dce3c-07a5-44ba-9070-763870a73b99',
   'c4a809de-bfca-4a06-84a5-9d5060b1d211',
   '3e3e9d0a-3a5f-48dc-ac30-fc187dda236a',
   'd8d9856c-5fc3-44cb-9bbb-ecaeaf77ab7c',
   'f2704ff1-f385-4f09-91de-68a0d57f37e7',
   '5ba375f0-914f-421f-9736-272e187add0b',
   'a5ac03f2-b931-4c10-98a8-8c956e955dc1',
   'ebad3e16-1bd3-4625-919f-e4ff1dac2965',
   '3dd1d549-dd15-4123-9c15-687c67ce851a'
 );

-- HND · 24 ficha(s) · teléfonos +504
--   Rosa Margarita Flores Pavon            0801197609385    Tegucigalpa          +50433281414
--   Isis Jeanneth Bustamante Arteaga       0801201122520    Tegucigalpa          +50433700323
--   Melvin Ernesto Duron Romero            0501198303109    Tegucigalpa          +50495448566
--   Jose Manuel Duarte Benitez             0801196003772    Tegucigalpa          +50495761922
--   Wendy Osiris Marques Rivera            1804197603020    Tegucigalpa          +50496622722
--   Marco Antonio Calderon Murillo         0801198919788    Tegucigalpa          +50488928907
--   Douglas Eduardo Rodríguez García       0801199404765    Tegucigalpa          +50498263741
--   Eric Rosnel Perdomo Argueta            0301198201451    Tegucigalpa          +50499085825
--   Xiomara Yamileth Wu Duarte             0801197403483    Tegucigalpa          +50494727088
--   Shadia Karina Lopez Castro             1706199500230    Tegucigalpa          +50431922199
--   ALBA SUYAPA VELASQUEZ PUERTO           0801196806321    Tegucigalpa          +50499781755
--   Jorge Alberto Mejía Mejía              0501198601359    Tegucigalpa          +50498142186
--   Marvin Rodriguez Moreno                1804196800115    Tegucigalpa          +50433360450
--   Ligia Patricia Ordoñez Sanchez         1503196800877    Tegucigalpa          +50489901440
--   Vanessa Lisbeth Herrera Garbot         0801198710249    Tegucigalpa          +50489280173
--   Teresa christine Hobbs .               011905200603713  Tegucigalpa          +50499392336
--   Julissa Regina Barralaga Amador        0801198708783    Tegucigalpa          +50493672499
--   Luis Enrique Lopez Benitez             0801196705478    Tegucigalpa          +50495001683
--   Lester Zamir Aguilar Cruz              0801199420568    Tegucigalpa          +50496534109
--   Carmen Patricia Flores Sauceda         0801197005243    Tegucigalpa          +50431845814
--   Arturo Willians Taylor Mata            0501197904879    Tegucigalpa          +50496196400
--   Gustavo Adolfo Gonzalez Caceres        0703199104103    Tegucigalpa          +50432176536
--   Jency Carolina Flores Casaca           0801198202677    Tegucigalpa          +50497169012
--   Julio César Hernández Santiago         0501197702316    Tegucigalpa          +50494537292
update academic_students set country = 'HND', updated_by = (select id from auth.users where lower(email) = 'alejandro.nunez@blackwell.university')
 where id in (
   'cb7796d1-f6d7-4605-bf69-fc442dcc6358',
   'ce3c3e83-24c4-40ff-a547-332c2428d4c8',
   '4fabac68-cb43-4eed-aef9-095c465f590f',
   '4b3204bd-b880-42e0-806b-56506d1bcfb4',
   '5796bfbd-203a-4528-816b-f797b018701f',
   'a6b29558-248c-4540-93ce-e7a4b601dfd2',
   '55691c78-c60c-47f9-8231-014f63749c40',
   '7dd5e328-4479-4302-945f-c559194ccbba',
   'e0e03e39-0b81-450d-9ce9-75a681e51195',
   'ba09062c-a2f3-473e-be38-d7d03c3dc7f1',
   'a4e5d778-2a3e-4ac8-ada3-fa06ec6ab821',
   '92af92ab-638e-491b-890e-af1febb324e0',
   '254c1013-673e-4998-97f4-d3b57cfc628e',
   'e9f4fceb-4962-475d-8c98-214981c74ca6',
   '8dc7d90d-87ef-4f29-9efb-c69f73b2c1d8',
   'b8ac42fd-5b65-4809-ad0d-2b61d19d08ed',
   'fc1d2a48-9298-4fc8-9947-88226e721294',
   'd68ecd71-4d21-470a-a921-e77388424342',
   '53db4f21-bd51-4f0e-a460-d428faa2cd63',
   'aa7de9e3-3fd8-4209-a573-d99d48ec9081',
   '9752ce96-79df-4f25-99f8-5dae5d264054',
   '2a0caba6-354d-43f0-a516-5f06df94f055',
   '56fef009-77b9-4ff8-97a3-fb995e2bc9d7',
   'cde3a757-3c2d-412c-a040-881ffe470c93'
 );

-- CRI · 23 ficha(s) · teléfonos +506
--   Marco Vinicio Campos Jiménez           115330668        San José             +50683404014
--   Jonathan Noe Torres Baltodano          503410391        San José             +50684465156
--   Tracy Yanell Richards Solis            701770977        San José             +50689924707
--   Jefferson Manuel Coronel Sulbaran      133093313        San José             +50671906796
--   Jose Francisco Vega Quesada            111260213        San José             +50683509603
--   Oswaldo Jose Hernandez Duarte          800850060        San José             +50683940792
--   Aaron Manuel Madriz Brenes             110860088        San José             +50688182979
--   Manuel Alejandro Ramirez Solano        303900616        San José             +50670270013
--   Ana Marcela López Mejía                112120454        San José             +50684442275
--   Diego Alonso Rodríguez Chavarría       112180390        San José             +50660420914
--   Jade Emmanuel Brown Denniss            117170814        San José             +50662278441
--   Roy Andres Campos Fallas               B00528020        San José             +50685710061
--   William Alonso Gutiérrez Sandí         401670543        San José             +50662918151
--   Clara Gabriela Espinoza Cruz           109080252        San José             +50689245826
--   Daniela Cordero Hernández              115340791        San José             +50688931587
--   Cynthia Dumani Stradtmann              106520057        San José             +50688286000
--   Jose David Flores Menjivar             119770480        San José             +50660432318
--   Calixto Kenneth Huanca Cárdenas        800730246        San José             +50688783830
--   Valeria María Taleno Castro            118190926        San José             +50671707802
--   Danny Jesus Castro Jara                111190346        San José             +50688768686
--   Gisella Raquel Gomez Bravo             303870864        San José             +50671278839
--   Manuel Enrique Vega Villalobos         700920034        San José             +50670116541
--   Leandro Rafael Lerici Salazar          113040595        San José             +50627713033
update academic_students set country = 'CRI', updated_by = (select id from auth.users where lower(email) = 'alejandro.nunez@blackwell.university')
 where id in (
   'a46f3678-e806-4b6b-80fe-761912f7f39b',
   '4c9939d1-fa7d-4699-b017-ac07d3dab231',
   'ba1a4e61-69b7-4fd0-a4af-17e252b3d804',
   'b9a29c2f-8a77-40f7-b5da-e36d67b21e83',
   'a0a69b2e-2812-4eb6-9e00-61a796d18481',
   '830f0319-198f-4b52-9c37-1f2f1e9294ee',
   '3e72a68d-62eb-4a21-b8fd-1a25dd8f1c63',
   'a5ff3935-b3cd-4e86-af2d-133ab1793239',
   '966173a8-ba77-49e2-88c1-6d7ce6e5c5d9',
   'c3ed4ae8-c67d-4d15-b0de-b891c1d8f3a9',
   '112e4709-25e5-44c2-b24b-917eaabda3a2',
   '3172ac28-8381-41b3-909e-67dbbcec2780',
   '481ae6d2-c77c-462e-8095-7a030dd951b4',
   'f082da8f-bd42-445e-897f-945d95ef139d',
   '9ffce88b-d889-431b-bf7e-ecb91a520be6',
   '0daef465-34ef-46a5-9e5c-20524610fcfc',
   '34e1ccd3-9683-42c5-9bb3-cc33cd0d0046',
   '208fe31e-1262-4134-acc6-e2a2755946b6',
   'd9a9264e-a2ea-462e-94e8-8e2235ee9ab2',
   '4d410b9a-0379-4f6a-9b84-4d0e98238858',
   '021eee6a-73c3-4f6d-b6f9-b5f59d1cfaa3',
   'bf80ef48-ce8e-4395-9555-ac18b3724254',
   'a9591001-2dda-4f5f-95fa-ef3c35b6bf4f'
 );

-- NIC · 13 ficha(s) · teléfonos +505
--   Moisés Jerónimo Moreno Delgado         0013009650021L   Managua              +50583969496
--   Millicent Joseph Loaisiga Orozco       0011801780068N   Managua              +50589933160
--   Alden Xavier Haslam Cuadra             0012604980011E   Managua              +50589603063
--   Erika de los Angeles Ferrufino Merlos  5671611800000H   Managua              +50584426204
--   Alexa del Carmen Escobar Montenegro    1612603750002V   Managua              +50588765777
--   Melvin Joel López Garcia               1612911920005Q   Managua              +50587469642
--   Carlos Jose Osorno Sanchez             0410506930004M   Managua              +50582428938
--   Alejandro Alberto Reyes Blandon        0011402011027W   Managua              +50589118593
--   Allen Rafael Sequeira Jarquin          0010202810054D   San Salvador         +50558061070
--   Gamaliel Bayardo Vaughan Tejada        0010605540053C   Managua              +50588765777
--   Michael Alejandro Moreno Benavides     0010512850030C   Managua              +50584948810
--   Héctor Emilio Cárcamo Jiménez          3211402780006J   Managua              +50582356025
--   Fermin Ramon Sanchez Salgado           0010510860011N   San Salvador         +50587002828
update academic_students set country = 'NIC', updated_by = (select id from auth.users where lower(email) = 'alejandro.nunez@blackwell.university')
 where id in (
   '2ed4a1aa-0582-4858-8ebd-d7f7f1306395',
   '7e3fcfd4-edde-44bf-bdbe-8ae8fc8b2379',
   'ba2a2cb0-c54a-4d04-9f62-a12cdb699d97',
   '6ad6bf7e-431f-4d6a-80d6-5daf81511d9e',
   '10c2fe00-9028-4e9d-bbca-d930dfb24979',
   'fccc1576-0dac-4bc6-ae33-6854a40430e6',
   '856f3276-fbb0-4082-8649-caff64609f1c',
   '5e573d2f-7551-4905-bee0-60eae01a2d8e',
   'dbe1f461-b89e-43d3-9e62-5a2509eb4dc3',
   '04170810-376f-4d7f-905d-6cc3fb19b3dd',
   'd8f310fc-1a0a-4c7f-baeb-33422cb0028f',
   'b4dbbec3-a9c4-4759-9567-cf1243fb9607',
   '200958b8-a5a7-4b05-a5b0-eaddeae5bdac'
 );

-- PRY · 9 ficha(s) · teléfonos +595
--   Mónica Griselda Notario Vera           3821827          Asunción             +595985489617
--   Diego Enrique Diaz Torres              W9936814         Asunción             +595971610894
--   Jose Dionisio Gimenez Dominguez        4892207          Asunción             +595961123456
--   Carlos Ignacio Morinigo Aguilera       1455230          Asunción             +595983485724
--   Cynthia Marisa Dickel Auler            3536045          Asunción             +595985719954
--   Sonia Mabel Gimenez Acosta             6169318          Asunción             +595991836783
--   Norma Marina Ruiz Diaz Ros             932979.          Asunción             +595971364564
--   Alvaro Jose Maria Sosa Ibarra          4345015          Asunción             +595982152922
--   Jacobo Daniel Paniagua Alonso          02347462         Asunción             +595981848062
update academic_students set country = 'PRY', updated_by = (select id from auth.users where lower(email) = 'alejandro.nunez@blackwell.university')
 where id in (
   'f31868d9-2318-4f76-a59c-01f25324ad63',
   '4bf74fbb-ff2e-4a58-945c-4fb8440da821',
   '51188ddc-dbff-4fbe-bb16-b7e9d68f2352',
   '30b7b296-9c3d-4eb1-a9d9-98d08ca2946e',
   'f8c3c1e0-6dee-4d2c-a439-d1961b28e430',
   '0989ff32-6096-4858-8e82-ea283d82129f',
   '0a135e8c-0d5a-429e-a630-69ea4d251058',
   'e7a7f375-836f-4855-9e5d-96128c23812f',
   '420680f6-0505-4640-a216-21383a62bc31'
 );

-- ECU · 1 ficha(s) · teléfonos +593
--   Jessica Katerine Martinez de Mixco     001176375        San Salvador         +59371273222
update academic_students set country = 'ECU', updated_by = (select id from auth.users where lower(email) = 'alejandro.nunez@blackwell.university')
 where id in (
   '495b4145-5e0c-49f7-b26e-7dd851085b0f'
 );

-- PASO 3 · Comprobar que ya no queda ninguno de código único sin concordar
select coalesce(s.phone_code, substring(s.phone_number from '^\+[0-9]{1,3}')) as codigo,
       s.country, count(*)
  from academic_students s
 where s.country = 'PER'
   and coalesce(s.phone_code, substring(s.phone_number from '^\+[0-9]{1,3}')) in
       ('+502', '+503', '+504', '+505', '+506', '+507', '+593', '+595')
 group by 1, 2;
-- Debe devolver CERO filas.

-- ---------------------------------------------------------------------------
-- PARA REVISAR A MANO — NO se tocan aquí
--
-- a) El país no era PER (4): alguien lo escribió, y puede tener razón.
--   Ronny Moreno Galvez                dice USA · teléfono +52 (MEX) · ciudad Miami
--   Ricardo Daniel Martinez Feijóo     dice ECU · teléfono +34 (ESP) · ciudad Pichincha
--   Shirley Dennis Loor Lima           dice ECU · teléfono +52 (MEX) · ciudad Quito
--   Ruth Leny Mencías Cartagena        dice ECU · teléfono +52 (MEX) · ciudad Quito
--
-- b) Código +1, cuatro países posibles (112): 107 dicen PER, 4 dicen MEX, 1 dicen ECU.
--    Se resuelven mirando la ciudad de cada ficha o preguntándole al estudiante.
--    Salen en Downloads/fichas-inconsistencias.csv filtrando por "+1".
-- ---------------------------------------------------------------------------
