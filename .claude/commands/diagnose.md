---
name: diagnose
description: Loop de diagnóstico disciplinado para bugs difíciles y regresiones de performance. Reproduce → minimiza → hipotetiza → instrumenta → corrige → test de regresión. Úsalo cuando algo esté roto, fallando o con rendimiento degradado.
---

# Diagnose

Una disciplina para bugs difíciles. Saltear fases solo cuando esté explícitamente justificado.

## Fase 1 — Construir un feedback loop

**Esta es la habilidad clave.** Si tienes una señal pass/fail rápida, determinística y ejecutable por el agente para el bug, lo encontrarás. Si no, ninguna cantidad de mirar el código ayudará.

### Formas de construirlo — probar en este orden

1. **Test fallido** en cualquier seam que alcance el bug — unitario, integración, e2e.
2. **Script curl/HTTP** contra un servidor dev corriendo.
3. **Invocación CLI** con fixture de entrada, diffing stdout contra snapshot conocido.
4. **Script headless** (Playwright) — conduce la UI, verifica DOM/consola/red.
5. **Replay de traza capturada** — guardar request real en disco, reproducir en aislamiento.
6. **Harness desechable** — instanciar subconjunto mínimo del sistema que ejercite la ruta del bug.
7. **Loop de property/fuzz** — si el bug es "salida a veces incorrecta", correr 1000 inputs aleatorios.

Construir el feedback loop correcto es el 90% del trabajo.

## Fase 2 — Reproducir

Ejecutar el loop. Ver el bug aparecer.

- [ ] El loop produce el modo de fallo que describió el usuario — no otro fallo cercano.
- [ ] El fallo es reproducible en múltiples ejecuciones.
- [ ] Se capturó el síntoma exacto (mensaje de error, salida incorrecta, tiempo lento).

## Fase 3 — Hipotetizar

Generar **3–5 hipótesis rankeadas** antes de probar cualquiera.

Cada hipótesis debe ser **falsificable**: declarar la predicción que hace.

> Formato: "Si <X> es la causa, entonces <cambiar Y> hará que el bug desaparezca."

Mostrar la lista rankeada al usuario antes de probar.

## Fase 4 — Instrumentar

Cada sonda debe mapear a una predicción específica de la Fase 3. **Cambiar una variable a la vez.**

Preferencia de herramientas:
1. **Debugger/REPL** si el entorno lo soporta.
2. **Logs estratégicos** en puntos de decisión clave.
3. **Bisección** si el bug apareció entre dos estados conocidos.

## Fase 5 — Corregir

Una vez identificada la causa raíz:
- [ ] Fix mínimo que resuelve la causa raíz (no el síntoma)
- [ ] Verificar con el feedback loop de la Fase 1

## Fase 6 — Test de regresión

- [ ] Convertir el loop de reproducción en un test permanente
- [ ] El test debe fallar sin el fix, pasar con él

## Si genuinamente no puedes construir un loop

Detente y decirlo explícitamente. Listar qué se intentó. Pedir al usuario: (a) acceso al entorno que lo reproduce, (b) artefacto capturado (log, HAR file), o (c) permiso para agregar instrumentación temporal en producción.
