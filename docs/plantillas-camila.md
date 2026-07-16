# Plantillas de WhatsApp para Camila (retención)

Para crear en **Twilio Console → Messaging → Content Template Builder**, que las envía a Meta para aprobación y les asigna el `ContentSid`.

> **Se crean desde Twilio, no desde Meta.** Twilio no importa de forma fiable las plantillas creadas en Meta Business Manager: quedan aprobadas pero sin `ContentSid`, y sin él no se pueden enviar. Ya nos pasó — hubo que rehacerlas con nombres nuevos (Meta rechaza duplicados y borrar arriesga bloquear el nombre por semanas).

## Antes de crearlas

**Categoría: `UTILITY` (Utilidad), no `MARKETING`.**
Es defendible: son estudiantes **matriculados** (relación de servicio vigente) y el mensaje trata de su situación académica, no de vender nada. Importa porque Utility es más barata y aguanta mejor el filtro de spam. Si Meta reclasifica alguna a Marketing, avísame y la reescribimos.

**Crea cada plantilla en español Y en inglés** (mismo nombre, distinto idioma). Meta permite variantes por idioma de una misma plantilla, y tenemos estudiantes en 18 países. Camila detecta el idioma, pero la plantilla es texto fijo: sin la variante en inglés, al angloparlante le llega el primer mensaje en español.

**La cadencia es 1 / 3 / 7 / 14** (días desde que entra a la campaña, que arranca a los 7 días sin entrar al aula). Sólo se usan mientras **no responda**. Apenas conteste, se acaban las plantillas y todo sigue en conversación libre.

**Regla de Meta:** no pueden empezar ni terminar con variable. Todas cumplen.

**Variables: escribe `{{name}}` y `{{days}}`, pero no te fíes.** Meta no acepta variables numeradas al crear a mano, pero **Twilio las convierte a `{{1}}` y `{{2}}`** al enviarlas a aprobación: el nombre es sólo una etiqueta de su UI. Por eso el motor NO asume ninguna de las dos formas — lee de la API de Twilio qué espera cada plantilla (`whatsapp_templates.variables`) y arma el `ContentVariables` según eso. Si no calza, Twilio rechaza el envío y no sale ningún mensaje.

---

## 1. `camila_retencion_dia1` · UTILITY

**Cuerpo:**
```
Hola {{name}}, soy Camila, del equipo de Acompañamiento Académico de Blackwell Global University.

Vi que no has entrado al aula virtual esta semana y quería saber si va todo bien.

¿Me cuentas qué pasó?
```
- `{{name}}` = nombre del estudiante · ejemplo: `Ana`

**Inglés:**
```
Hi {{name}}, I'm Camila, from the Academic Support team at Blackwell Global University.

I noticed you haven't logged into the virtual classroom this week and wanted to check that everything is okay.

Could you tell me what happened?
```

> Abre **preguntando**, nunca advirtiendo. No sabemos por qué desapareció: puede estar enfermo o en duelo.

---

## 2. `camila_retencion_dia3` · UTILITY

**Cuerpo:**
```
Hola {{name}}, te escribí hace unos días y no he sabido de ti.

A veces lo que frena es algo puntual: no poder entrar al aula, una duda con el pago, o simplemente el tiempo.

Sea lo que sea, lo podemos resolver. ¿Cuál es tu caso?
```
- `{{name}}` = nombre del estudiante · ejemplo: `Ana`

**Inglés:**
```
Hi {{name}}, I wrote to you a few days ago and haven't heard back.

Sometimes what holds you back is something specific: trouble logging in, a question about payment, or simply time.

Whatever it is, we can sort it out. What's your situation?
```

> Nombra las trabas concretas. Al estudiante le cuesta menos elegir una que explicar desde cero.

---

## 3. `camila_retencion_dia7` · UTILITY

**Cuerpo:**
```
Hola {{name}}, ya son {{days}} días sin que entres al aula y me preocupa.

Todavía estás a tiempo de retomar sin perder lo que ya avanzaste, y me gustaría ayudarte a organizarlo.

¿Qué día podrías entrar?
```
- `{{name}}` = nombre del estudiante · ejemplo: `Ana`
- `{{days}}` = días sin entrar al aula · ejemplo: `21`

**Inglés:**
```
Hi {{name}}, it's been {{days}} days since you last entered the classroom and I'm concerned.

There's still time to pick up where you left off without losing your progress, and I'd like to help you plan it.

What day could you log in?
```

> Pide **una fecha**, no una intención. Y no promete que "falta poco": eso sería mentira para quien lleva media malla pendiente, y la plantilla es texto fijo que no se puede matizar.

---

## 4. `camila_retencion_dia14` · UTILITY

**Cuerpo:**
```
Hola {{name}}, este es mi último mensaje y no quiero dejarlo así.

Si estás pasando por algo que ahora te impide estudiar, existe el retiro temporal: pausas tus estudios y conservas tu lugar para volver cuando puedas.

¿Prefieres que te ayude a retomar, o a solicitar la pausa?
```
- `{{name}}` = nombre del estudiante · ejemplo: `Ana`

**Inglés:**
```
Hi {{name}}, this is my last message and I don't want to leave things like this.

If you're going through something that keeps you from studying right now, there's a temporary leave option: you pause your studies and keep your place to return when you can.

Would you rather I help you get back on track, or request the pause?
```

> La más importante. Cualquiera de las dos respuestas nos sirve: o retoma, o hace un **LOA limpio** en vez de desaparecer en silencio. Un LOA es infinitamente mejor que una deserción muda: conserva la relación y la posibilidad de que vuelva. Además cumple lo prometido — es el último mensaje, y no volver a escribir es lo que protege la reputación del número.

---

## 5. `camila_retencion_deuda` · UTILITY — pendiente de crear

Los deudores necesitan otra conversación y por eso están fuera de la campaña
(`retention_settings.contact_debtors = false`) hasta que esta plantilla exista.

**Por qué:** con saldo pendiente se les **restringe el acceso al aula**. No es que no
entren: es que **no pueden**, porque los bloqueamos nosotros. Son el 74% del grupo de
7-13 días — justo al que la campaña prioriza. Mandarles el `dia1` genérico
("¿por qué no has entrado?") es preguntarle a alguien por qué no entra a un sitio
del que lo sacamos.

**Cuerpo:**
```
Hola {{name}}, soy Camila, del equipo de Acompañamiento Académico de Blackwell Global University.

Vi que tu acceso al aula está restringido por un saldo pendiente. No necesitas pagarlo todo para volver a entrar: con un compromiso de pago que puedas cumplir, te libero el acceso.

¿Lo vemos juntos?
```
- `{{name}}` = nombre del estudiante · ejemplo: `Ana`

**Inglés:**
```
Hi {{name}}, I'm Camila, from the Academic Support team at Blackwell Global University.

I saw that your classroom access is restricted because of an outstanding balance. You don't need to pay it all to get back in: with a payment arrangement you can actually keep, I can restore your access.

Shall we sort it out together?
```

> No pregunta nada: le dice al estudiante exactamente qué le pasa y le ofrece la
> salida en tres líneas. Debería tener mejor respuesta que las otras cuatro, porque
> es la única que llega con la solución en la mano en vez de con una pregunta.
> Y no menciona el monto a propósito: el saldo se conversa, no se echa en cara.

Cuando esté aprobada: sincronizar y encender `contact_debtors`.

---

## Recomendación: pie de baja

Considera añadir en las plantillas 2, 3 y 4:

```
Responde BAJA si no quieres recibir más mensajes.
```

Suma una línea, pero **una baja vale mucho más que un reporte de spam**: la baja no afecta la calidad del número, el reporte sí, y con la línea recién estrenada es cuando más frágil está. Camila ya entiende la baja (código `no_contactar` → `do_not_contact`).
