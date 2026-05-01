---
name: tdd
description: Desarrollo guiado por tests con ciclo red-green-refactor. Úsalo cuando quieras construir features o corregir bugs usando TDD, o cuando pidas desarrollo test-first.
---

# Test-Driven Development

## Filosofía

**Principio central**: Los tests deben verificar comportamiento a través de interfaces públicas, no detalles de implementación. El código puede cambiar completamente; los tests no deberían.

**Buenos tests** son estilo integración: ejercitan rutas de código reales a través de APIs públicas. Describen _qué_ hace el sistema, no _cómo_ lo hace.

**Malos tests** están acoplados a la implementación. Mockean colaboradores internos o verifican a través de medios externos. La señal de alerta: tu test falla cuando refactorizas, pero el comportamiento no cambió.

## Anti-patrón: Slices Horizontales

**NO escribas todos los tests primero, luego toda la implementación.** Esto produce tests malos que prueban comportamiento _imaginado_, no _real_.

**Enfoque correcto**: Slices verticales via tracer bullets. Un test → una implementación → repetir.

```
MAL (horizontal):
  RED:   test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

BIEN (vertical):
  RED→GREEN: test1→impl1
  RED→GREEN: test2→impl2
  RED→GREEN: test3→impl3
  ...
```

## Workflow

### 1. Planificación

Antes de escribir cualquier código:
- [ ] Confirmar con el usuario qué cambios de interfaz son necesarios
- [ ] Confirmar qué comportamientos testear (priorizar)
- [ ] Listar los comportamientos a testear (no pasos de implementación)
- [ ] Obtener aprobación del usuario sobre el plan

### 2. Tracer Bullet

Escribir UN test que confirme UNA cosa sobre el sistema:
```
RED:   Escribir test para el primer comportamiento → falla
GREEN: Escribir código mínimo para pasar → pasa
```

### 3. Loop Incremental

Para cada comportamiento restante:
```
RED:   Escribir siguiente test → falla
GREEN: Código mínimo para pasar → pasa
```

Reglas:
- Un test a la vez
- Solo el código suficiente para pasar el test actual
- No anticipar tests futuros

### 4. Refactor

Después de que todos los tests pasen, buscar candidatos a refactor:
- [ ] Extraer duplicación
- [ ] Ejecutar tests después de cada paso de refactor

**Nunca refactorizar en RED.** Llegar a GREEN primero.

## Checklist por ciclo

```
[ ] El test describe comportamiento, no implementación
[ ] El test usa solo interfaz pública
[ ] El test sobreviviría un refactor interno
[ ] El código es mínimo para este test
[ ] No se agregaron features especulativas
```
