-- Deshacer: contenido previo de los 7 articulos de Sofia corregidos por la auditoria de coherencia (23/08/2026).
-- Tras ejecutar, reindexar embeddings via POST /api/cron/reindex-knowledge.
BEGIN;
  UPDATE sofia_knowledge SET content = '¿Cuál es la modalidad y en qué idiomas se ofrece MBA?
Modalidad: Online. Idiomas publicados: Inglés y español.
Palabras clave: mba, modalidad, idioma, online
Fuente: https://blackwell.university/degree-programs/graduates/master-of-business-administration/' WHERE id = '97fd1f2d-7cdf-4e49-9c56-fe15cf0a2fea';
  UPDATE sofia_knowledge SET content = 'El mensaje ''Acceso inválido, intente otra vez'' en el Campus virtual/LMS generalmente indica un problema con las credenciales de ingreso. Pasos recomendados antes de escalar: 1) verifica que estás usando tu correo/usuario institucional correcto (ej. nombre@blackwell.pro); 2) confirma que la contraseña sea la vigente y revisa mayúsculas/espacios; 3) intenta restablecer o recuperar tus credenciales desde la opción correspondiente; 4) prueba desde otro navegador. Si tras estos pasos el acceso sigue fallando, se registra un ticket para que el área de soporte técnico revise y restablezca tu acceso; para agilizarlo, ten a la mano el correo/usuario con el que intentas ingresar.

Palabras clave: acceso invalido, campus virtual, lms, credenciales, error de acceso, contraseña' WHERE id = '7c638b79-3906-4b3e-8fae-c22883ba33aa';
  UPDATE sofia_knowledge SET content = 'Por razones de seguridad y privacidad, Sofia no puede mostrar ni consultar tu correo institucional desde el chat. Para recuperarlo debes verificar tu identidad con el equipo de soporte: escribe al Helpdesk institucional indicando tu nombre completo y número de documento o código de estudiante, y el equipo validará tu identidad y te ayudará a recuperar el acceso a tu correo institucional. También puedes solicitar que se te derive con un asesor humano para gestionar la verificación.

Palabras clave: correo institucional, recuperar acceso, olvidé correo, helpdesk, identidad, seguridad' WHERE id = '498d9607-4dee-4dba-9fe7-c752885c7526';
  UPDATE sofia_knowledge SET content = 'El acceso al campus/portal de BGU utiliza un sistema de enlace de acceso (''magic link''): no se usa contraseña tradicional. Para ingresar, ve a la página de inicio de sesión, selecciona la pestaña ''Estudiante'' e ingresa tu correo institucional (@blackwell.pro). El sistema enviará un enlace de acceso directo a ese correo, válido por tiempo limitado (aprox. 1 hora). Abre el enlace desde tu correo institucional para ingresar de forma segura. Si no recibes el correo, revisa spam, verifica que uses el correo institucional (no el personal) y cierra sesiones previas de Gmail personal en el navegador. Si el problema persiste o el enlace redirige a otra plataforma, se deriva a soporte técnico (helpdesk@blackwell.university) mediante ticket.

Palabras clave: contraseña, acceso, magic link, correo institucional, campus, recuperación, login' WHERE id = '550f9d37-b9e2-4708-afc5-f322a8e9d52c';
  UPDATE sofia_knowledge SET content = 'Puedes recuperar tu contraseña en el link
https://campus.blackwell.university/login/forgot_password.php ' WHERE id = 'cf4d45d2-a913-4c9e-8e55-6f2d8d7f01fc';
  UPDATE sofia_knowledge SET content = 'Si un estudiante no comprende el estado de una materia (por ejemplo ''Desaprobado'', ''editada'' o una nota como 70) o no recibió retroalimentación de un trabajo, puede solicitar una revisión al área académica. El estudiante debe indicar el programa, el curso (código y nombre), la nota o estado que observa y, de ser posible, una captura de pantalla. Sofia registra un ticket dirigido al área académica para que revisen el caso, expliquen el motivo de la calificación y proporcionen el feedback correspondiente. Los estados de las materias se visualizan en el portal del estudiante, sección Notas: https://system.blackwell.university/student/grades

Palabras clave: revisión de notas, feedback, calificación, desaprobado, materia reprobada, retroalimentación, área académica' WHERE id = '566cefeb-1fd1-42f2-a89b-32d384f8302b';
  UPDATE sofia_knowledge SET content = 'Los pagos no siempre se reflejan de inmediato en el sistema. Tras realizar un pago (por ejemplo vía Flywire), el área de pagos debe verificar y registrar la transacción antes de que se actualice el estado de cuenta y se habilite el acceso al campus. Este proceso puede tardar algunas horas hábiles. En caso tenga urgencia de ingresar al sistema puede acceder a la opción "Excepción de Pago" en el Portal del Estudiante (https://system.blackwell.university/portal)

Palabras clave: reflejo de pago, flywire, habilitación de acceso, verificación de pago, comprobante, plazos' WHERE id = '7958f7b2-5f88-4fbb-9f70-9d1227df0e6b';
COMMIT;
