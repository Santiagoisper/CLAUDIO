---
name: grill-with-docs
description: Sesión de grilling que desafía tu plan contra el modelo de dominio existente, afina la terminología y actualiza la documentación (CONTEXT.md, ADRs) en línea mientras se cristalizan las decisiones. Úsalo para someter a prueba un plan contra el lenguaje documentado del proyecto.
---

Entrevístame implacablemente sobre cada aspecto de este plan hasta que lleguemos a un entendimiento compartido. Recorre cada rama del árbol de diseño, resolviendo dependencias entre decisiones una por una. Para cada pregunta, proporciona tu respuesta recomendada.

Haz las preguntas de a una por vez, esperando feedback antes de continuar.

Si una pregunta se puede responder explorando el código, explora el código en lugar de preguntar.

## Conciencia de dominio

Durante la exploración del código, busca también documentación existente:

### Estructura de archivos

```
/
├── CONTEXT.md          ← glosario del dominio
├── docs/
│   └── adr/            ← decisiones arquitectónicas
└── src/
```

Crea archivos de forma lazy — solo cuando tengas algo que escribir. Si no existe `CONTEXT.md`, créalo cuando se resuelva el primer término.

## Durante la sesión

### Desafiar contra el glosario
Cuando uses un término que conflictúe con el lenguaje en `CONTEXT.md`, señálalo inmediatamente.

### Afinar lenguaje vago
Cuando el usuario use términos vagos o sobrecargados, propone un término canónico preciso.

### Discutir escenarios concretos
Cuando se discutan relaciones de dominio, ponlos a prueba con escenarios específicos que exploren casos borde.

### Actualizar CONTEXT.md en línea
Cuando se resuelva un término, actualiza `CONTEXT.md` en ese momento. No acumules — captura mientras sucede.

No acoples `CONTEXT.md` a detalles de implementación. Solo incluye términos significativos para expertos del dominio.

### Ofrecer ADRs con moderación
Solo ofrece crear un ADR cuando se cumplan las tres condiciones:
1. **Difícil de revertir** — el costo de cambiar de opinión es significativo
2. **Sorprendente sin contexto** — un lector futuro se preguntaría "¿por qué lo hicieron así?"
3. **Resultado de un trade-off real** — hubo alternativas genuinas
