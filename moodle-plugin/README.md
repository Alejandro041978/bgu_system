# local_bgugrades — estructura del libro de calificaciones

Complemento de Moodle que expone, por webservice, **cómo está construido** el libro
de calificaciones de un aula: sus ítems, cuánto pesa cada uno, cuáles están activos
y con qué método se agregan. No devuelve la calificación de ningún estudiante.

## Por qué

El Auditor del Campus comprueba dos cosas: que las ponderaciones de las evaluaciones
activas sumen 100% y que el total del curso esté en escala sobre 100.

Moodle solo publica las ponderaciones a través del informe de un usuario matriculado
(`gradereport_user_get_grade_items`), y solo cuando ese usuario **tiene
calificaciones**. Medido sobre el campus el 12-08-2026: de 488 aulas con libro de
calificaciones, 319 no reportaban ponderación. Con la cuenta de servicio del auditor
—recién matriculada y sin actividad— no aparece **nunca**: 0 de 48.

El efecto práctico es el contrario del que se busca: un aula recién construida, sin
alumnos todavía, no se puede auditar hasta que llegue el primer estudiante y entregue
algo. La revisión de calidad sirve **antes** de que entre nadie.

Hasta hoy esa señal se suplía leyendo la base de datos de Moodle con un proceso
externo (N8N) que empujaba al ERP la suma aritmética de coeficientes. Funciona, pero
son dos tuberías con relojes distintos: el 30-07-2026, 48 aulas salieron
"incumplen" porque la suma era de siete días antes que la auditoría.

## Qué resuelve

- **Funciona con el aula vacía.** Lee la estructura, no las notas.
- **Dice qué falta, no solo que falta.** Devuelve el detalle por ítem, así que el
  auditor puede decir "faltan 3 de 4 Module Tests" en vez de "la suma no da 100".
- **Una sola fuente.** La medición y el dato nacen en la misma llamada; desaparece la
  lógica de "esta señal está caducada, se ignora".
- **No expone la base de datos.** La alternativa —conectar el ERP a MySQL— obligaría
  a abrir el puerto a las IP de salida de Vercel, que son dinámicas.

## Instalación

1. Copiar la carpeta `local_bgugrades` a `local/` en el servidor:
   `/ruta/a/moodle/local/local_bgugrades` → debe quedar como `/ruta/a/moodle/local/bgugrades`

   **El directorio debe llamarse `bgugrades`**, sin el prefijo `local_`. Moodle
   compone el nombre del componente a partir del tipo y la carpeta, y con
   `local/local_bgugrades` buscaría un componente llamado `local_local_bgugrades`.

2. Entrar como administrador a *Administración del sitio → Notificaciones*. Moodle
   detecta el complemento y pide confirmar la instalación.

3. Dar la capacidad al usuario del webservice. La función exige
   `moodle/grade:viewall`:
   - en el contexto de sitio, si se va a pedir el campus entero de una vez;
   - o en cada aula, si se piden aulas sueltas.

   El usuario del token del ERP es `erp-integration`.

4. Añadir la función al servicio externo que ya usa el ERP:
   *Administración del sitio → Servidor → Servicios web → Servicios externos* →
   editar el servicio → **Funciones** → añadir `local_bgugrades_get_grade_structure`.

5. Comprobar desde el ERP que aparece:
   `/api/moodle/ping?buscar=bgugrades`

## Uso

```
local_bgugrades_get_grade_structure(courseids: [437, 383])
local_bgugrades_get_grade_structure(courseids: [])   // todo el campus, hasta 400 aulas
```

Devuelve por aula:

| campo | qué es |
|---|---|
| `aggregation_raiz` | método de agregación de la categoría raíz (10 = media ponderada, 13 = natural) |
| `escala_total` | `grademax` del total del curso — debe ser 100 |
| `suma_coeficientes` | suma de `aggregationcoef` de los ítems de módulo activos |
| `categorias[]` | id, madre, nombre, método de agregación, profundidad |
| `items[]` | id, nombre, tipo, categoría, `aggregationcoef`, `aggregationcoef2`, oculto, visible, **activo** |

### Sobre las ponderaciones: hay dos campos, y hacen falta los dos

Los pesos **no viven en un solo sitio**:

- con agregación de **media ponderada** están en `aggregationcoef`;
- con agregación **natural** están en `aggregationcoef2`, y como fracción
  (`0.0833` = 8.33%).

Por eso se devuelven los dos más el método de agregación de cada categoría, y quien
lee decide. Devolver solo uno funciona en unas familias del campus y da números
absurdos en otras — y eso se descubre tarde, cuando ya hay actas de por medio.

### Sobre `activo`

Un ítem cuenta para la política solo si **ni él ni su recurso** están ocultos. Son dos
cosas distintas: un ítem visible puede colgar de un recurso oculto, y mirar solo una de
las dos fue lo que dejó pasar en su día el "peso fantasma" —ítems ocultos con
coeficiente mayor que cero que diluían la nota del resto—.

## Seguridad

- Solo lee. No hay ninguna escritura en Moodle.
- No devuelve datos personales ni calificaciones de nadie: solo la configuración.
- Exige `moodle/grade:viewall` en el contexto que corresponda.
- Tope de 400 aulas por llamada.
