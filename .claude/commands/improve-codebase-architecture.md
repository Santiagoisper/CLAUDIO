---
name: improve-codebase-architecture
description: Encuentra oportunidades de profundización en el código, informado por el lenguaje de dominio en CONTEXT.md y las decisiones en docs/adr/. Úsalo para mejorar la arquitectura, encontrar oportunidades de refactor, o hacer el código más testeable y navegable.
---

# Mejorar Arquitectura del Código

Identifica fricción arquitectónica y propone **oportunidades de profundización** — refactors que convierten módulos superficiales en profundos. El objetivo es testeabilidad y navegabilidad.

## Glosario de términos

- **Módulo** — cualquier cosa con interfaz e implementación (función, clase, paquete).
- **Interfaz** — todo lo que un caller debe saber para usar el módulo.
- **Profundidad** — apalancamiento en la interfaz: mucho comportamiento detrás de una interfaz pequeña.
- **Seam** — donde vive una interfaz; lugar donde el comportamiento puede alterarse sin editar in-place.
- **Test de eliminación** — imagina eliminar el módulo. Si la complejidad desaparece, era un pass-through. Si reaparece en N callers, se estaba ganando el puesto.

## Proceso

### 1. Explorar

Leer el glosario de dominio del proyecto y cualquier ADR en el área que se está tocando.

Luego caminar el código orgánicamente y notar dónde hay fricción:
- ¿Dónde entender un concepto requiere saltar entre muchos módulos pequeños?
- ¿Dónde los módulos son **superficiales** — interfaz casi tan compleja como la implementación?
- ¿Qué partes del código están sin testear, o son difíciles de testear con su interfaz actual?

Aplicar el **test de eliminación** a cualquier cosa sospechosamente superficial.

### 2. Presentar candidatos

Presentar lista numerada de oportunidades de profundización. Para cada candidato:

- **Archivos** — qué archivos/módulos están involucrados
- **Problema** — por qué la arquitectura actual causa fricción
- **Solución** — descripción en prosa de qué cambiaría
- **Beneficios** — explicados en términos de localidad y apalancamiento, y cómo mejorarían los tests

**NO proponer interfaces todavía.** Preguntar al usuario: "¿Cuál de estos te gustaría explorar?"

### 3. Loop de grilling

Una vez que el usuario elige un candidato, entrar en una conversación de grilling. Recorrer el árbol de diseño — restricciones, dependencias, forma del módulo profundizado, qué tests sobreviven.

Efectos secundarios inline mientras se cristalizan las decisiones:
- Si se nombra un módulo profundizado con un concepto no en `CONTEXT.md`, agregar el término ahí mismo.
- Si el usuario rechaza el candidato con una razón importante, ofrecer un ADR para documentar la decisión.
