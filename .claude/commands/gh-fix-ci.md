---
name: gh-fix-ci
description: Inspecciona los checks fallidos de GitHub Actions en el PR actual, descarga los logs, resume las fallas y propone un plan de fix. Úsalo cuando un CI/CD falle en GitHub Actions y quieras diagnóstico + corrección.
---

# Gh Fix CI

Usa `gh` para localizar checks fallidos en el PR, obtener logs de GitHub Actions, resumir las fallas y proponer un plan de fix.

## Prerrequisitos

```bash
# Verificar autenticación
gh auth status

# Si no estás autenticado:
gh auth login
```

## Workflow

### 1. Resolver el PR actual

```bash
gh pr view --json number,url,headRefName
```

Si el usuario proporciona un número o URL de PR, usar ese directamente.

### 2. Inspeccionar checks fallidos

```bash
# Ver todos los checks del PR
gh pr checks <número-pr>

# Para cada check fallido, obtener el run ID desde la URL de detalles
gh run view <run_id> --json name,workflowName,conclusion,status,url

# Obtener logs del run
gh run view <run_id> --log | tail -200
```

### 3. Identificar el scope

- **GitHub Actions**: analizar logs completos, identificar paso que falló, extraer mensaje de error.
- **Checks externos** (Buildkite, CircleCI, etc.): solo reportar la URL de detalles, marcar como fuera de scope.

### 4. Resumir fallas

Proporcionar para cada check fallido:
- Nombre del check y URL del run
- Extracto del log con el error específico
- Indicación clara si no hay logs disponibles

### 5. Crear plan de fix

Antes de implementar, presentar al usuario:
1. Causa raíz identificada
2. Cambios propuestos (archivos, qué cambia y por qué)
3. Cómo verificar que el fix funciona

Esperar aprobación explícita antes de implementar.

### 6. Implementar y verificar

Después de aprobación:
- Aplicar cambios mínimos que resuelvan la causa raíz
- Sugerir re-ejecutar `npm run build` / `npm test` localmente
- Proponer push y verificar que el CI pase: `gh pr checks <número-pr> --watch`

## Comandos útiles de referencia

```bash
# Ver runs recientes
gh run list --limit 10

# Ver jobs específicos de un run
gh run view <run_id> --json jobs

# Ver log de un job específico
gh api "/repos/{owner}/{repo}/actions/jobs/<job_id>/logs"

# Re-ejecutar jobs fallidos
gh run rerun <run_id> --failed

# Monitorear checks en tiempo real
gh pr checks <número-pr> --watch
```

## Para CLAUDIO específicamente

Los checks más comunes en este repo:
- **build** — `npm run build` (TypeScript)
- **test** — `npm test` (agent-benchmark)

Si el build falla: verificar errores de TypeScript en `src/`.
Si el test falla: verificar conectividad con Railway y variables de entorno `CLAUDIO_TOKEN` y `ANTHROPIC_API_KEY`.
