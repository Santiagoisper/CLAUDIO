---
name: to-prd
description: Convierte el contexto de la conversación actual en un PRD y lo publica como issue en GitHub. Úsalo cuando quieras crear un PRD a partir del contexto actual.
---

Este skill toma el contexto de la conversación actual y el entendimiento del código para producir un PRD. NO entrevistes al usuario — sintetiza lo que ya sabes.

## Proceso

1. Explorar el repo para entender el estado actual del código. Usar el vocabulario del glosario de dominio del proyecto a lo largo del PRD.

2. Esbozar los módulos principales que necesitan construirse o modificarse. Buscar activamente oportunidades para extraer módulos profundos que puedan testearse en aislamiento.

   Un módulo profundo es aquel que encapsula mucha funcionalidad en una interfaz simple y testeable que raramente cambia.

   Verificar con el usuario que estos módulos coincidan con sus expectativas.

3. Escribir el PRD usando el template de abajo, luego publicarlo como issue en GitHub usando la herramienta `claudio_github_create_issue` o `shell_exec` con `gh issue create`.

## Template del PRD

```markdown
## Declaración del Problema

El problema que enfrenta el usuario, desde su perspectiva.

## Solución

La solución al problema, desde la perspectiva del usuario.

## User Stories

Lista numerada de user stories en el formato:
1. Como <actor>, quiero <feature>, para que <beneficio>

## Decisiones de Implementación

- Los módulos que se construirán/modificarán
- Las interfaces de esos módulos
- Decisiones técnicas y arquitectónicas
- Cambios de esquema
- Contratos de API

NO incluir rutas de archivo específicas ni fragmentos de código.

## Decisiones de Testing

- Qué hace un buen test (solo comportamiento externo)
- Qué módulos se van a testear
- Arte previo para los tests (tests similares en el código existente)

## Fuera de Alcance

Descripción de lo que está fuera de alcance para este PRD.

## Notas adicionales

Cualquier nota adicional sobre el feature.
```
