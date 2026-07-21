#!/usr/bin/env node
import fetch from 'node-fetch';

const analysis = `# ASISTENTE_BOT - Sistema BOPE Completo

## Concepto Central
No es una aplicación tradicional. Es un **sistema de gobierno multi-agente** para Claude con:
- 10 agentes especializados con roles definidos
- Cadena de mando jerárquica (SANTIAGO → JOHN → especialistas)
- Protocolo de activación (skill /batallon)
- Event log + memory system
- Doctrina táctica escrita y versionada en Git
- Validación, sanciones y medallas automáticas

## Arquitectura del Batallón BOPE

### Cadena de Mando
\`\`\`
SANTIAGO (Comandante Supremo) 
  ↓
JOHN/RAMBO (Sargento Mayor - único punto de contacto con Santiago)
  ├→ PIXEL (Frontend Teniente)
  ├→ FORGE (Backend Teniente)
  ├→ HOUSE (QA Especialista)
  ├→ CERBERUS (Seguridad Guardian)
  ├→ NEXUS (Integración Wire)
  ├→ WINSTON (Cronista - documentación)
  ├→ MARCO AURELIO (Consejero ético - habla directo con John)
  ├→ BLADE (Reconocimiento encubierto)
  └→ SICARIO (Operativo especial sin fricción)
\`\`\`

### Agentes y Responsabilidades

**JOHN (Sargento Mayor)**
- Único canal a Santiago
- Orquestación táctica
- Árbol de decisión para paralelismo (Task)
- Modo incidente: congelación → separación → contención → validación
- Criterio propio pero reporta al Comandante

**PIXEL (Frontend)**
- UI/UX, onboarding
- Cuando: UI rota, crisis visual
- NO cuando: bug de backend puro

**FORGE (Backend)**
- APIs, Neon PostgreSQL, Node/TypeScript, Drizzle ORM
- Vercel deploy, variables de entorno
- Modo incidente: degradación controlada, failover, protección datos

**HOUSE (QA)**
- Pre-release, post-incidente validation
- Automatizado o manual
- NO en prototipo sin riesgo

**CERBERUS (Seguridad)**
- Auth, permisos, secrets, credenciales
- Rotación de keys, superficie expuesta
- Modo incidente: primero separar, luego contener
- Sincronización con FORGE para ejecución

**NEXUS (Integración)**
- End-to-end flows, múltiples sistemas
- Credenciales, accesos, últimas 48h en incidente
- Coordina con CERBERUS en crisis

**WINSTON (Cronista)**
- Documentación, changelogs, NOTICIAS-BATALLON.log
- **Cierre automático obligatorio**: git add → commit → push → deploy
- Event log inmutable para forense
- Registra medallas, sanciones, ascensos

**MARCO AURELIO (Consejero)**
- Dilemas éticos, medallas, sanciones
- Puede hablar con John en cualquier momento
- John NO le da órdenes, lo consulta

**BLADE (Reserva especial)**
- Reconocimiento encubierto
- Solo con auth Santiago + John

**SICARIO (Operativo especial)**
- Ejecución total sin fricción
- Frentes resistentes
- Orden de Santiago o John

### Protocolo de Activación (/batallon)

Ejecuta 4 pasos automáticos:

1. **Cargar doctrina canónica** desde BOPE_VERSION_DEFINITIVA (9 archivos)
2. **Cargar legajos** de los 10 agentes
3. **Leer estado actual** del proyecto (MISION-ACTIVA.md, últimas noticias)
4. **Mostrar pantalla oficial** con estado del batallón

**Trigger:** Usuario escribe \`BOPE\` en Claude Code
→ John responde: "Sargento Mayor JOHN presente, Comandante. Batallón en posición. ¿Cuál es la orden?"

## Protocolo de Paralelismo (Task)

Cuándo usar múltiples agentes simultáneos:
- 2+ dominios independientes
- Cada uno puede ser un agente especializado
- Ganancias de tiempo justifican coordinación

Estructura de cada Task:
\`\`\`
Task(
  agent: "[NOMBRE]",
  prompt: """
    FRENTE: [nombre]
    SCOPE: [qué hacer exactamente]
    CRITERIO DE CIERRE: [evidencia concreta]
    RESTRICCIONES: [qué no tocar]
    MODELO: [haiku|sonnet|opus]
    REPORTE A: JOHN (no directo a Santiago)
  """
)
\`\`\`

Selección de modelo:
- **haiku**: tarea trivial, lectura
- **sonnet**: código, razonamiento, DEFAULT
- **opus**: solo con autorización explícita de Santiago

## Árbol de Decisión para Incidentes

Detección de comportamiento anómalo:

1. **CONGELAR**: No deploy, no reinicio, no patch sin autorización
2. **SEPARAR** (paralelo: NEXUS + CERBERUS):
   - NEXUS: credenciales, accesos, últimas 48h
   - CERBERUS: secrets, variables, superficie expuesta
3. **CONTENER** (FORGE): degradación controlada, failover
4. **VALIDAR** (HOUSE): solo DESPUÉS de contención
5. **SICARIO**: solo si hay punto único de compromiso quirúrgico
6. **COMUNICACIÓN**: una sola voz (John o Santiago)

## Doctrina de Incidentes (lessons learned)

- Parche ≠ servidor limpio. Verificar persistencia.
- Sin password robada igual hay compromiso (tokens, cookies)
- No rotar a ciegas. Primero inventariar crown jewels.
- Tercero comprometido = vector interno
- No esconder impacto. Separar respuesta técnica de disclosure.
- Primero verdad operativa, después fragmentar

## Protocolo de Cierre WINSTON (Automático)

Al finalizar misión, Winston ejecuta SIN ESPERAR:
\`\`\`
git add logs/ .claude/ README.md [modificados]
git commit -m "docs(winston): [misión] — [fecha]"
git push origin main
vercel --prod (si aplica)
\`\`\`

Formato de anuncio:
\`\`\`
══════════════════════════════════════════
🟣 WINSTON — CIERRE DE SESIÓN INICIADO
══════════════════════════════════════════
Documentando cambios...
Ejecutando: git add → commit → push → deploy
Sin pausas. Sin confirmaciones.
══════════════════════════════════════════
\`\`\`

Si éxito:
\`\`\`
══════════════════════════════════════════
✅ WINSTON — SESIÓN CERRADA
══════════════════════════════════════════
Commit: [hash] — [mensaje]
Push:   origin/main ✓
Deploy: [URL o "no aplica"]
Repositorio sincronizado con GitHub.
La misión quedó registrada.
══════════════════════════════════════════
\`\`\`

## Tabla de Activación

| Agente | Activar cuando | NO activar |
|--------|---|---|
| PIXEL | UI rota, crisis UX | Bug backend puro |
| FORGE | DB caída, infra, migración | Problema superficie |
| HOUSE | Pre-release, post-incidente, fix prod | Prototipo sin riesgo |
| NEXUS | Flujo end-to-end roto | Fix una capa |
| CERBERUS | Auth, P1 con riesgo exposición | Tarea funcional |
| WINSTON | Cierre, post-mortem, tiempo real N1 | Consultas sin misión |
| MARCO | Dilema ético, medallas, decisión moral | Problemas técnicos |
| BLADE | Reconocimiento encubierto | Batallón sin precisión |
| SICARIO | Ejecución quirúrgica sin fricción | Tareas con carga doctrinal |

## Informe Final (JOHN a SANTIAGO)

\`\`\`
=======================================
INFORME DE MISIÓN — [ID] [TÍTULO]
=======================================
ESTADO: [COMPLETADA | PARCIAL | BLOQUEADA]

RESULTADO:
[Qué se hizo. Evidencia. Máx 3 líneas]

FRENTES EJECUTADOS:
• [AGENTE] → [qué hizo] → [score]

NOVEDADES BATALLÓN:
• [Ascensos, sanciones, gaps]

DECISIÓN REQUERIDA:
• [Solo lo que necesita tu aprobación]
=======================================
\`\`\`

## Reglas Inquebrantables

1. Solo JOHN consolida hacia SANTIAGO en ritmo normal
2. Nunca actúar fuera del scope de MISION-ACTIVA.md
3. Nunca bypasear SANTIAGO en decisiones arquitecturales
4. No abrir más frentes de los que se pueden sostener
5. Sin informe de cierre de WINSTON, la misión no existe
6. MARCO AURELIO puede hablar con JOHN en cualquier momento

## Stack Técnico

- **Doctrina**: Archivos markdown en .claude/
- **Agentes**: 10 personas definidas con tools [Read, Write, Edit, Bash, GitHub, Task]
- **Activación**: Skill /batallon que carga estado y muestra pantalla oficial
- **Persistencia**: GitHub (fuente canónica)
- **Deploy**: Vercel + WINSTON cierre automático
- **DB**: Neon PostgreSQL (opcional para War Room)

## Aplicable a CLAUDIO

1. **Estructura multi-agente jerárquica**: modelo para cuando CLAUDIO tenga múltiples especialistas
2. **Event sourcing + doctrina versionada**: patrón para memoria y auditoría
3. **Protocolo de paralelismo con Task**: para ejecución coordinada
4. **Cierre automático**: WINSTON pattern para git + deploy
5. **Incidente response system**: árbol de decisión estructurado
6. **Cadena de mando única**: pattern para control operativo coherente`;

async function saveAnalysis() {
  const memory = {
    kind: "analisis",
    content: analysis,
    metadata: {
      repo: "Asistente_bot",
      category: "multi-agent-orchestration",
      date: new Date().toISOString(),
      learning_focus: ["agent hierarchy", "event sourcing", "incident response", "parallel execution", "auto-closure"]
    }
  };

  try {
    const resp = await fetch("http://localhost:3737/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": "Bearer 5d18775be84be469c832871e7b84c478741b32af7a79b898598bc8b7821eec55",
        "mcp-protocol-version": "2025-03-26"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "claudio_remember",
          arguments: memory
        }
      })
    });
    const data = await resp.json();
    if (data.error) console.error("Error:", data.error.message);
    else console.log("✓ Asistente_bot (BOPE system) análisis guardado en CLAUDIO");
  } catch(e) {
    console.error("Error:", e.message);
  }
}

saveAnalysis();
