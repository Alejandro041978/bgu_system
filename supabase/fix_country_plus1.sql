-- ---------------------------------------------------------------------------
-- Corrección por lote del país: fichas con teléfono +1.
--
-- CÓMO SE RESUELVE SIN ADIVINAR
-- El +1 lo comparten Estados Unidos, Canadá y una veintena de países del Caribe,
-- pero DENTRO del +1 el código de área identifica al país: 787 y 939 son Puerto
-- Rico; 809, 829 y 849 República Dominicana; 758 Santa Lucía.
--
-- LA REGLA DE ESTE ARCHIVO
-- Se corrige solo cuando la CIUDAD declarada corrobora al código de área — dos
-- señales independientes que coinciden. Los de área 787/939 dicen Juana Díaz, un
-- municipio de Puerto Rico; los de 809/829/849 dicen Santo Domingo; el de 758
-- dice Castries, capital de Santa Lucía. No hay una sola fila donde se
-- contradigan. Entran 103.
--
-- QUÉ NO ENTRA, Y POR QUÉ NO ES UN ERROR
-- 9 fichas se quedan como están:
--   · Seis tienen línea de Estados Unidos (áreas 762, 239, 646, 818, 618, 636 —
--     Georgia, Florida, Nueva York, California, Illinois, Misuri) pero viven en
--     Lima, Arequipa, Pasco, Guayaquil o México DF. Su país YA concuerda con su
--     ciudad: lo único llamativo es que tienen un número extranjero, y eso no es
--     un error.
--   · Tres tienen códigos de área que el plan de numeración no asigna (555, que
--     está reservado para ficción, 552 y 554). Su país también concuerda con su
--     ciudad mexicana; lo que está mal es el teléfono.
--
-- No se toca la ciudad: ya concuerda con el país propuesto.
-- ---------------------------------------------------------------------------

-- PASO 1 · Ver qué se va a cambiar (no modifica nada)
select s.document_number,
       concat_ws(' ', s.first_name, s.last_name, s.second_last_name) as estudiante,
       s.country as pais_actual, s.city, s.phone_number,
       substring(regexp_replace(s.phone_number, '^\+1', ''), 1, 3) as codigo_area
  from academic_students s
 where s.country not in ('USA', 'CAN', 'DOM', 'PRI')
   and coalesce(s.phone_code, substring(s.phone_number from '^\+[0-9]{1,3}')) = '+1'
   and lower(translate(coalesce(s.city, ''), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) in ('juana diaz', 'santo domingo', 'castries')
 order by s.city, s.last_name;

-- PASO 2 · La corrección, un bloque por país
-- DOM · 56 ficha(s)
--   Mabel Aldara Arredondo Almonte de Dura 03103895672    Santo Domingo   +18299225155    area + ciudad
--   Gerardo Antonio Polonia Belliard       107185779      Santo Domingo   +18097917073    area + ciudad
--   Paola Joselyn Garcia Hernandez         0313999425     Santo Domingo   +18295398706    area + ciudad
--   Rosmeyli Meyn Buthon                   R12661390      Santo Domingo   +18493934699    area + ciudad
--   Juan Carlos Abreu Frias                04800598312    Santo Domingo   +18092246005    area + ciudad
--   Franklin Herrera Lopez                 05900003582    Santo Domingo   +18097059976    area + ciudad
--   Yngrid Matilde Diaz Nuñez              03100752538    Santo Domingo   +18098707178    area + ciudad
--   Lizbel Aldara Arredondo de Mirabal     03102861105    Santo Domingo   +18492060505    area + ciudad
--   Joel Santiago Mejia Diaz               01000789022    Santo Domingo   +18094888807    area + ciudad
--   Lidia Esther Perez Coca                00115722837    Santo Domingo   +18292627301    area + ciudad
--   Julia Elisa Benitez Marte de Rondon    15500039530    Santo Domingo   +18098802184    area + ciudad
--   Ernesto Payano Hernández               RD5190048      Santo Domingo   +18093993152    area + ciudad
--   Sandra Rivas Ferreras                  00111452520    Santo Domingo   +18093575563    area + ciudad
--   Rafael Antonio Mirabal Batista         470183109      Santo Domingo   +18099863222    area + ciudad
--   Jonnathan Anthony Gonzalez Tejada      22500031921    Santo Domingo   +18297058561    area + ciudad
--   Santiago Rodriguez Soto                00103728283    Santo Domingo   +18097986790    area + ciudad
--   Alexandra De Los Santos                00113547004    Santo Domingo   +18498808803    area + ciudad
--   Lonis Alfredo Gonzalez Diaz            RD5603363      Santo Domingo   +18094444542    area + ciudad
--   Cecilia Esther Jimenez Hiciano         05401471684    Santo Domingo   +18299620998    area + ciudad
--   Matias Benjamin Reynoso Vizcaino       105527758      Santo Domingo   +18299221471    area + ciudad
--   Adalberto Ramirez Martínez             N203476.       Santo Domingo   +18294712247    area + ciudad
--   Alba Monserrat Mejía Alberto           40234878607    Santo Domingo   +18297221682    area + ciudad
--   Kiara Isa Frias De Rodriguez           40221458975    Santo Domingo   +18098859750    area + ciudad
--   María del Rosario Blanco de Ureña      05400308465    Santo Domingo   +18293521171    area + ciudad
--   Joel Natan Holguin de Dios             06800475144    Santo Domingo   +18492494398    area + ciudad
--   Linda Esther Fernandez De Ramirez      04701674659    Santo Domingo   +18094219749    area + ciudad
--   Sureidy Mercedes De la Cruz Rodriguez  40220568147    Santo Domingo   +18298447308    area + ciudad
--   Yane Altagracia Hernández Núñez        00103688909    Santo Domingo   +18492204508    area + ciudad
--   Argenis De Jesús Florentino Goris      40212020149    Santo Domingo   +18494981823    area + ciudad
--   Geovanny Josefina Lopez De Lopez       05400880729    Santo Domingo   +18292130555    area + ciudad
--   Boni-Su Rijo Rijo                      02800873537    Santo Domingo   +18293836068    area + ciudad
--   Francina Altagracia Castillo Gil       40226818850    Santo Domingo   +18099013452    area + ciudad
--   Nelson Antonio Perdomo Morales         18299627406    Santo Domingo   +18299627406    area + ciudad
--   Sheila Minowska Estrella Garcia        00115866287    Santo Domingo   +18297700380    area + ciudad
--   Josefina Celenia Vidal Peralta         00100642495    Santo Domingo   +18097076610    area + ciudad
--   Hansel Rolando Peña Alcántara          40221010628    Santo Domingo   +18099151740    area + ciudad
--   Ylesia Diaz De Garcia                  00108662511    Santo Domingo   +18099148626    area + ciudad
--   Noely Acosta Pichardo                  40210145138    Santo Domingo   +18298738836    area + ciudad
--   Mimi Matar Harb                        00117719955    Santo Domingo   +18098824142    area + ciudad
--   Audrey Rafaelina Reynoso Vargas        00108874538    Santo Domingo   +18099728019    area + ciudad
--   Maria Fernanda Arredondo Gomez         40233785142    Santo Domingo   +18295187381    area + ciudad
--   Angel Adriano Paula Gabriel            05600167224    Santo Domingo   +18093306650    area + ciudad
--   Yokasta Altagracia Guzmán Santos       00100813757    Santo Domingo   +18492494917    area + ciudad
--   Santiago Henriquez Urban               00113514137    Santo Domingo   +18498786077    area + ciudad
--   Sunilda Altagracia Cordero de Hernande 00104260765    Santo Domingo   +18299625054    area + ciudad
--   Juleisy Elizabeth Marte Nicolás        40223360138    Santo Domingo   +18295532905    area + ciudad
--   Ruddy Miguel Simons Llauger            02300140197    Santo Domingo   +18293800023    area + ciudad
--   Luis Manuel Frías Marte                05900200360    Santo Domingo   +18292988663    area + ciudad
--   Patricia Alejandra Torres De Rodriguez 40244037384    Santo Domingo   +18494720336    area + ciudad
--   Jose Alberto Cruz Ramírez              03100949084    Santo Domingo   +18098571239    area + ciudad
--   Teofilo Elpidio Vargas Concepción      00112416128    Santo Domingo   +18492143020    area + ciudad
--   Willy Hill Oviedo                      02301552937    Santo Domingo   +18296103135    area + ciudad
--   Nilo Rafael Mercedes de la Cruz        00108985425    Santo Domingo   +18098662636    area + ciudad
--   Emilia Esther Lega Pinales de de la Cr 00105438626    Santo Domingo   +18097078525    area + ciudad
--   Loreimy Valentina Blandino Díaz        40215261278    Santo Domingo   +18493538365    area + ciudad
--   Delkis Del Carmen Molina Martinez      00113991939    Santo Domingo   +18299274971    area + ciudad
update academic_students set country = 'DOM', updated_by = (select id from auth.users where lower(email) = 'alejandro.nunez@blackwell.university')
 where id in (
   'fd3d9313-2719-4fe4-9667-b99b0cbf28b1',
   '6104d7d4-d259-48fa-936e-74ed5159d452',
   'c6d02c49-9319-42d1-80d0-d41a3f13cfbf',
   '236d2da0-b77a-4a18-bb24-3212590412ec',
   '328a65bd-03d1-4c44-aee0-eeb9093e6ae0',
   'c14516ac-e3fa-4f30-94e6-953fa0700309',
   '0704a68f-7fe5-441d-8711-b3ea0a5aaf8f',
   '4eb4f780-a3d3-42dd-a773-f6786c9ca8d1',
   '76a9e156-786b-4c27-a3a3-d3fe82429f5f',
   '19a914a2-1cf0-41d8-ad51-7354bf8af191',
   '7bc928e6-6e24-4c92-b756-e2f56f57dbbb',
   '8d662d1b-f134-47a0-840a-736819ad1016',
   '7d3b4ab1-2d42-405e-b539-671312e1db0e',
   'd859a4f8-45fb-4c62-a287-3f7d55634e7e',
   'a6d0e18c-0bcc-44ae-a8ce-70de7a5313d8',
   'ca4f1c92-dab4-4981-9107-e9ef1f4625ec',
   '15407c17-e926-4aca-a167-a2414334f5b4',
   '3e31456d-b66d-419b-b9fa-d3ceebd8980a',
   '0b49f98e-c97b-49b4-bdba-2243d4f3dcc6',
   'ac64c00c-5fe4-4015-a75c-ccdf96f3a402',
   '4101ae7b-ec15-4561-b831-9f5e748164aa',
   '2b9db472-c6e8-4f60-8a2f-6acdb92832a1',
   'f82ecf2e-c29c-427c-a0d0-b839504875df',
   '8cf0ae5f-4f1d-4dd9-a172-d84c7c4a221d',
   'b4f4db40-cbbd-46f6-a356-d49f323e2381',
   '3faf107a-0028-4713-969f-1b6794a5a0ca',
   'fb336fc1-3da3-49bf-becf-7005744b1efd',
   'cdeff519-c432-45af-abb9-92daafbe4fd3',
   'da14dd03-4efa-4d34-8933-6bf0d005b660',
   '4febed4c-c23a-4a00-9418-4281194decfd',
   '7676628c-ccbb-4708-b35c-86608c7ef1be',
   '9f06dd2a-2518-47b3-b946-29b6be84b3b8',
   '13652ff4-9e58-4ba8-83af-d3cfabeca171',
   'd26e733a-33e7-4328-9ae3-58b403c68dcc',
   '36135837-b077-4343-b397-ad8fe9b0f0f6',
   'ada1f466-d336-4dab-80fc-0596fb7e03e6',
   'fb876672-4899-4ae5-819e-0f00d68905f0',
   '89ec1361-e390-4cbc-a977-c1ea78aa8ccc',
   '6d247433-8f5d-4912-a808-a48e5c48f028',
   'a6fc9bba-b43f-413f-9519-40d354ef53fe',
   '651d64ff-96f4-4694-a7ef-a9394e3aeb7f',
   '08d95efa-1740-49aa-8bfc-6585ef1d97b2',
   '53551193-0857-40db-8dba-bd16f61543ba',
   'd06ea991-87f3-42b3-88cb-72835198e045',
   'c1083676-e038-49f1-b34e-3348ff9e723d',
   'd19791a8-a1f8-46ae-8c6d-ecd54ad30062',
   'aa6e8658-1cb1-40a1-b6ea-c2c8b870567f',
   'b6a22a4a-668c-4edc-9f74-8a538980cca2',
   '1d9a693e-6551-4940-9297-5b0f570acbd5',
   'b024d8b3-5c6f-4fa0-b4f4-eb7529e112c9',
   '1e360050-9a46-4af2-bf6c-61527a1eb7f2',
   '0d99cdfb-4906-46df-beac-4c7363d6ece4',
   '345d1a4a-21de-4998-99bf-be588740cc0b',
   'b96d356b-badb-4d36-8bfa-9c012697dd31',
   'a2c4226d-c18b-4e51-9a67-61005145d7f0',
   '4d46a3e2-3834-4c83-8676-8e958024be2f'
 );

-- PRI · 46 ficha(s)
--   Manuel Eugenio Marcano Rivera          .736135        Juana Díaz      +17873274052    area + ciudad
--   Enriqueta González Cruz                1930336        Juana Díaz      +19393519045    area + ciudad
--   Wilna Rodriguez Torres                 2083878        Juana Díaz      +17874873143    area + ciudad
--   Maria Milagros Alvarez Ocasio          4855442        Juana Díaz      +17876169766    area + ciudad
--   Sandra Rodriguez .                     2579683        Juana Díaz      +17874695746    area + ciudad
--   Jovalis Baez Rivera                    5081890        Juana Díaz      +17873749027    area + ciudad
--   Edna Cristina De La Cruz Freeman       0207190        Juana Díaz      +17875026715    area + ciudad
--   Miosotis Echevarria Roman              595802215      Juana Díaz      +17879407867    area + ciudad
--   Natalia Flores Alicea                  4675730        Juana Díaz      +19393951812    area + ciudad
--   Luz Yanira Orengo Cruz                 2129862        Juana Díaz      +17874841168    area + ciudad
--   Luz Yesenia Lopez Molina               2212018        Juana Díaz      +17876462558    area + ciudad
--   Jenizaret Colón Molina                 4942942        Juana Díaz      +1939263057     area + ciudad
--   Lucin Aida Tapia Ortiz                 666661868      Juana Díaz      +17872981967    area + ciudad
--   Juanita Otero Santana                  2276867        Juana Díaz      +17874281949    area + ciudad
--   Nilsa E. Vélez Carrión                 1386863        Juana Díaz      +17875626284    area + ciudad
--   Mariangely Lopez Rivera                6630854        Juana Díaz      +17876439472    area + ciudad
--   Carmen Maria Bonilla Torres            674516127      Juana Díaz      +17875307685    area + ciudad
--   Enrique Castellano Perez               6021695        Juana Díaz      +17874632121    area + ciudad
--   Evelyn Ramirez Marquez                 6763514        Juana Díaz      +17872203572    area + ciudad
--   Kamir Garces Mejias                    589535680      Juana Díaz      +17874260572    area + ciudad
--   Javier Rodriguez Rivera                4274141        Juana Díaz      +17876784400    area + ciudad
--   Shirley Ramos Perez                    4266626        Juana Díaz      +17879752827    area + ciudad
--   Michele Mary Colon Rosario             5054478        Juana Díaz      +17873937396    area + ciudad
--   Angel Luis Perez Rodriguez             4166075        Juana Díaz      +17874854830    area + ciudad
--   Johanna Rivera Velez                   4113085        Juana Díaz      +17874813933    area + ciudad
--   Olga Maria Morales Del Valle           4140095        Juana Díaz      +17876719229    area + ciudad
--   Miguel Eduardo Marrero Medina          2259623        Juana Díaz      +17876421921    area + ciudad
--   Paola Olivo Bula                       6479982        Juana Díaz      +17874103623    area + ciudad
--   Keimarisse Colon Diaz                  6058777        Juana Díaz      +17872204667    area + ciudad
--   Shelimar Vallejo de Jesus              4141264        Juana Díaz      +17876498422    area + ciudad
--   Adriana Nicole Rosario Ferrer          597794043      Juana Díaz      +17874047779    area + ciudad
--   María Elena Noriega Escobedo           4706151        Juana Díaz      +17874059377    area + ciudad
--   Javier Solis Rivera                    1945464        Juana Díaz      +17873648975    area + ciudad
--   Maria Margarita Rivera Sullivan        2036297        Juana Díaz      +17876449187    area + ciudad
--   Francisco Javier Gutierrez Galvan      6856275        Juana Díaz      +17875281709    area + ciudad
--   Dana Marie Lopez Rivera                6880884        Juana Díaz      +17876449187    area + ciudad
--   Ruth Enid Flores Esmurria              4244198        Juana Díaz      +17872196929    area + ciudad
--   Krissmellie Rivera Cruz                6864993        Juana Díaz      +17879831557    area + ciudad
--   Luana Sierra Resto                     4350359.       Juana Díaz      +17874797111    area + ciudad
--   Carlos Manuel Lopez Perez              C34086385      Juana Díaz      +17872385064    area + ciudad
--   Jessica Cristina Diaz Diaz             2126262        Juana Díaz      +17874007000    area + ciudad
--   Paola Nicole Rivera Torres             6905077        Juana Díaz      +17873885500    area + ciudad
--   Sandra Judith Perez Cruz               2066687        Juana Díaz      +17874666943    area + ciudad
--   Manuel Angel Quiñones Lebrón           1766140        Juana Díaz      +17876076429    area + ciudad
--   Massiel Carolina Atacho Fuenmayor      7195586        Juana Díaz      +17874125022    area + ciudad
--   Frank John Rivera Villanueva           1683945        Juana Díaz      +17875527769    area + ciudad
update academic_students set country = 'PRI', updated_by = (select id from auth.users where lower(email) = 'alejandro.nunez@blackwell.university')
 where id in (
   '4aebbe9c-685b-4264-bf93-e3d2245adb56',
   'c36ce5da-0b25-44cc-aa98-f6585d0fdadd',
   '6277238f-ff64-4545-ae2c-a6035b4b6c6e',
   'a0056d1c-539b-4203-a670-b2cb1d2cccb5',
   '705add0b-6496-4b96-a507-6510cea724c0',
   '3c3c6e80-37f5-4b41-b9f7-8f85b53f2d06',
   '7938ddac-e019-479a-ab16-29ceff5fac22',
   '82e500db-ba3c-4150-9009-afb9e0cdacaf',
   '636f00ee-4a20-4d31-a473-1a1752659994',
   '8906ba11-a06f-4eb8-9efc-cd79c7efb203',
   '745aa5f4-a84d-4685-afc8-3c733c8a0c2c',
   '70ae709f-4d24-4aa2-95ac-8b2e7fca8ae1',
   'c612c137-0df5-42f7-acbd-4779ee5f68d6',
   'dec581cc-7120-4964-b005-616d484667cf',
   'f344c574-d20b-4701-acdd-709b92aced4f',
   '47a4b7f7-3033-4722-bc66-5d93f9a42c0a',
   'b8a9f542-2dbc-441d-bbca-0dd0f6007639',
   '1eadaee0-45ad-416f-8682-090528ffe1cd',
   '3b2a4381-42c6-4f84-84a5-46a747012760',
   'cd15cbd8-45c4-40f0-8d8f-d6ba1e433db2',
   'e7e1ea0a-b397-4381-a327-afdcd2174382',
   '124dd090-43cc-49e8-b9d3-e2486088fd5a',
   '2dec5f72-22dd-4363-823e-1175b267c4cf',
   '320fac3e-8563-45e5-8d02-1f59deab380a',
   '635cdd52-271f-4bcd-a766-8ab3dc2dfd32',
   'db2d9482-6e00-42d0-a52e-4841a9bee6b8',
   'ddccd147-30d0-4b73-9723-03a02afe5326',
   'a9730b34-627e-44a5-88a4-99b7457891a7',
   '3e18ddc1-4377-4b07-9f72-2fdb4b490152',
   '51ad5e88-72ff-454a-a1d3-86b56b0a253c',
   '99d853bc-39a8-4380-96b8-7d6569b61479',
   '723370e3-9cd1-40cb-9f9d-40c575bab2a0',
   'bf131dee-4003-4d6f-9e31-9b48e7ebc89c',
   'e1c9beba-cd81-496e-af89-a1ee22a5cceb',
   'cb6c7edc-485c-41d2-baf2-c081fa7e7581',
   'c4c4e575-7e6a-4bee-8cf4-21a9c2964d51',
   '49d7f77a-33b4-4903-a3fa-af8ad1ea2172',
   'fc499617-41e5-48c7-bca3-d67eea405d27',
   '204dd1b5-c35e-4f2d-a45e-4394c78881d3',
   'b30c98be-5c0d-4620-a65e-488c93990ada',
   '0f3db787-396a-4abe-97ee-68e13b19fc7c',
   '7570ffcc-5d3e-4bf9-9e5f-654d2176d817',
   '997223de-b07e-4cf6-b79e-a7afa23cdc60',
   'a97cef41-e933-480e-9719-69e43b343b56',
   '394f3d6c-7780-45bb-9b24-c7ffc10076d7',
   '7dc2ece4-0736-4855-9b35-f9c79e82d06b'
 );

-- LCA · 1 ficha(s)
--   Shervana Francia Francis .             312768..       Castries        +17587200874    area + ciudad
update academic_students set country = 'LCA', updated_by = (select id from auth.users where lower(email) = 'alejandro.nunez@blackwell.university')
 where id in (
   'a8c55238-a04e-477f-8808-c980af9ecdc2'
 );

-- PASO 3 · Comprobar
select s.country, count(*)
  from academic_students s
 where coalesce(s.phone_code, substring(s.phone_number from '^+[0-9]{1,3}')) = '+1'
 group by 1 order by 2 desc;

-- ---------------------------------------------------------------------------
-- SE QUEDAN COMO ESTÁN — ninguna es un error del país
--   Suzzette Nadya Yvette Flores Gaste +17623167828   
--        linea de Estados Unidos (area 762, Georgia) pero vive en Lima (PER): su pais ya concuerda con su ciudad
--   Rubén Ojeda Hernández              +15554381675   
--        el codigo de area 555 no esta asignado: el numero no es marcable. Vive en México DF (MEX), que si concuerda
--   Katya Luisa Pajuelo Avalos         +12393078401   
--        linea de Estados Unidos (area 239, Florida) pero vive en Pasco (PER): su pais ya concuerda con su ciudad
--   Mariapia Dayanna Arboleda Espinoza +16462756037   
--        linea de Estados Unidos (area 646, Nueva York) pero vive en Guayaquil (ECU): su pais ya concuerda con su ciudad
--   Edgard Enrique Canevaro Cornejo    +18189705461   
--        linea de Estados Unidos (area 818, California) pero vive en Arequipa (PER): su pais ya concuerda con su ciudad
--   Luis Uriel Sánchez Ramírez         +15520800403   
--        el codigo de area 552 no esta asignado: el numero no es marcable. Vive en Naucalpan (MEX), que si concuerda
--   Vladimir Juventino Martinez Torres +16182000670   
--        linea de Estados Unidos (area 618, Illinois) pero vive en México DF (MEX): su pais ya concuerda con su ciudad
--   Karen Lisseth Carrasco Cullanco    +16362609964   
--        linea de Estados Unidos (area 636, Misuri) pero vive en Lima (PER): su pais ya concuerda con su ciudad
--   Edgar Omar Velázquez Arciniega     +15548700417   
--        el codigo de area 554 no esta asignado: el numero no es marcable. Vive en Ciudad de México (MEX), que si concuerda
--
-- Los tres de código no asignado (555, 552, 554) tienen un teléfono que no se
-- puede marcar. Eso sí hay que corregirlo, preguntándoles.
-- ---------------------------------------------------------------------------
