# Propuesta de Arquitectura de Backend — Nexova Solutions

**Estado:** Propuesta técnica para revisión del CTO; no constituye implementación ni aprobación del CTO.  
**Escenario:** sede principal en Valencia, España, y oficina de expansión en Miami, Florida, Estados Unidos.
**Ubicación:** `docs/ARCHITECTURE_PROPOSAL.md` en el monorepo `FranckDomingues/Company-Nexova-FranckDomingues`.

## 1. Contexto y objetivo

Nexova Solutions es una consultora de recursos humanos y selección de talento con sede principal en Valencia, España, y una oficina de expansión en Miami, Florida, Estados Unidos. El contexto del repositorio describe tres líneas de negocio: headhunting, soporte externalizado y formación corporativa. Para la primera evolución del backend se toma como caso orientador el soporte externalizado: 30 agentes, resolución media de 48 horas frente a un SLA de 24 horas, y herramientas dispersas como Zendesk legacy, HubSpot, Google Workspace y un ATS antiguo. Estos datos proceden de `CONTEXT.md`, `company-choice.md` y `BRIEFING.md` de Nexova; no representan mediciones nuevas.

El objetivo de este documento es fundamentar **cómo organizar** el backend antes de programarlo. El sistema de soporte con IA/RAG es una visión futura; no se afirma que ya exista ni que el backend haya sido desplegado.

## 2. Patrón arquitectónico propuesto y alternativas

**Elección:** monolito modular con arquitectura en capas, exponiendo una única API FastAPI inicial dentro de `services/`. Los módulos se separarán por dominio funcional y conservarán límites explícitos entre API, aplicación, dominio e infraestructura. Esta elección es compatible con el énfasis del template del monorepo en una API centralizada y evita la complejidad de desplegar y coordinar microservicios para un equipo tecnológico de seis personas.

- **Capa API/presentación:** routers HTTP, validación de entrada/salida, códigos de respuesta y autorización; no concentra reglas del negocio.
- **Capa aplicación:** casos de uso, coordinación y manejo de errores de aplicación (p. ej., registrar solicitud, consultar estado o buscar documentación aprobada).
- **Capa dominio:** entidades, reglas relevantes para tickets, SLA y decisiones de escalamiento; no depende del framework web.
- **Capa infraestructura:** adaptadores para persistencia, helpdesk existente, fuentes documentales y otros servicios externos. Las integraciones se realizarán solo cuando se definan credenciales, permisos y contratos reales.

**Alternativas consideradas:** MVC es útil para separar modelos, vistas y controladores, pero no explica por sí solo límites de integración y casos de uso en un backend API-first. Los microservicios añaden despliegues, comunicaciones distribuidas y operación que el proyecto aún no necesita. Serverless puede ser apropiado para tareas aisladas futuras, pero no se justifica como estructura general sin requisitos de carga y operación. La elección es revisable cuando existan datos medidos de escala, disponibilidad o equipos independientes.

## 3. Ubicación y estructura propuesta

Se **preserva** el monorepo y sus carpetas existentes. La siguiente estructura es una propuesta futura, no un listado de archivos implementados:

```text
Company-Nexova-FranckDomingues/
├── CONTEXT.md
├── company-choice.md
├── docs/
│   └── ARCHITECTURE_PROPOSAL.md       # Este documento
├── uis/
│   ├── website/                       # Sitio público existente
│   └── backoffice/                    # Interfaz interna, cuando corresponda
├── services/
│   └── api/                           # API central propuesta (NO creada)
│       ├── app/
│       │   ├── __init__.py
│       │   ├── main.py                # Composición de la app y routers
│       │   ├── core/
│       │   │   ├── config.py          # Configuración por entorno
│       │   │   └── security.py        # Reglas transversales de autenticación
│       │   ├── api/
│       │   │   ├── dependencies.py    # Dependencias HTTP compartidas
│       │   │   └── routers/
│       │   │       ├── inquiries.py   # Formulario público
│       │   │       ├── tickets.py     # Operación de soporte
│       │   │       └── knowledge.py   # Base de conocimiento
│       │   ├── domains/
│       │   │   ├── inquiries/
│       │   │   ├── support/
│       │   │   └── knowledge/
│       │   │       # Dentro de cada dominio: modelos/reglas y casos de uso
│       │   ├── schemas/               # Contratos HTTP de entrada y salida
│       │   └── infrastructure/        # Persistencia e integraciones externas
│       └── tests/                     # Pruebas futuras
├── data/                               # Pipelines y evaluaciones, cuando apliquen
└── shared/                             # Contratos no ejecutables compartidos
```

**Criterio:** las rutas agrupan recursos HTTP; las reglas y casos de uso se agrupan por dominio. Los esquemas de API no se confunden con modelos de persistencia, y los adaptadores externos no se importan desde las reglas del negocio. `services/api` es una propuesta coherente con el README de la plantilla; no se crea un directorio `backend/` paralelo.

## 4. Routers y endpoints propuestos

Todos los endpoints que siguen son **ilustrativos, no implementados**. El prefijo común `/api/v1` posibilita evolucionar contratos sin depender de URLs internas de archivos.

| Dominio | Método y ruta | Propósito | Exposición prevista |
|---|---|---|---|
| Salud técnica | `GET /health` | Verificar disponibilidad superficial | Supervisión técnica |
| Consultas comerciales | `POST /api/v1/inquiries` | Recibir el formulario público existente (actualmente simulado) | Público, con controles antiabuso |
| Soporte | `GET /api/v1/tickets` | Consultar solicitudes autorizadas | Personal autenticado |
| Soporte | `GET /api/v1/tickets/{ticket_id}` | Ver detalle según permisos | Personal autenticado |
| Soporte | `POST /api/v1/tickets` | Crear solicitud cuando exista integración definida | Personal o canal autorizado |
| Conocimiento | `GET /api/v1/knowledge/articles` | Consultar documentación aprobada | Personal autenticado |
| Conocimiento | `POST /api/v1/knowledge/search` | Solicitar búsqueda documental futura | Personal autenticado |

**Agrupación:** `inquiries.py`, `tickets.py`, `knowledge.py` serían tres `APIRouter` incluidos por `main.py`, con tags y prefijos de dominio. La API usaría esquemas validados para solicitudes y respuestas. Códigos de error y políticas de autorización se definirían por operación. No se propone aún un endpoint que responda con IA ni que modifique automáticamente tickets: requieren validación funcional y permisos.

## 5. Investigación de FastAPI y decisiones derivadas

La guía oficial *Bigger Applications – Multiple Files* muestra `app/main.py`, `dependencies.py` y `routers/`, con módulos de ruta e inclusión mediante `app.include_router(...)`. De allí adoptamos un punto de composición y routers por recurso, ampliados con capas de dominio/infraestructura para las necesidades de Nexova. FastAPI no impone de forma obligatoria todas las capas aquí propuestas: esa separación es una **decisión de diseño del equipo**, no una afirmación sobre la estructura única del framework.

FastAPI documenta configuración con variables de entorno y Pydantic Settings, y proporciona `CORSMiddleware` para comunicación de navegador entre distintos orígenes. También documenta dependencias para acceso a recursos (p. ej., sesiones de persistencia); la biblioteca concreta de base de datos permanece por decidir cuando haya requisitos de datos.

Fuentes oficiales consultadas:
- https://fastapi.tiangolo.com/tutorial/bigger-applications/
- https://fastapi.tiangolo.com/tutorial/cors/
- https://fastapi.tiangolo.com/advanced/settings/
- https://fastapi.tiangolo.com/tutorial/sql-databases/

## 6. Separación frontend/backend y operación

El frontend público actual reside en `uis/website/` y utiliza HTML, Tailwind vía CDN y JavaScript. Su formulario valida datos en el navegador pero **simula el envío**: no hay backend ni persistencia vinculada, según `uis/website/README.md`. Una integración futura usaría `fetch` sobre HTTPS hacia `POST /api/v1/inquiries`, con contratos JSON documentados y validación repetida en el servidor (la validación del navegador no es una frontera de confianza).

Frontend y backend pueden vivir en el **mismo monorepo** y ejecutarse/desplegarse como sistemas separados. La separación lógica no exige repositorios distintos. La URL del backend se configurará por entorno; las credenciales y tokens de proveedores nunca deberán colocarse en JavaScript público. Si los orígenes son distintos, se configurará `CORSMiddleware` con una lista explícita de orígenes permitidos, métodos y encabezados necesarios. **CORS no reemplaza autenticación ni autorización**.

Configuraciones propuestas (nombres orientativos): `APP_ENV`, `API_ALLOWED_ORIGINS`, `DATABASE_URL` y `EXTERNAL_HELPDESK_URL`. Los valores sensibles se suministrarán mediante gestión segura de secretos en el entorno de ejecución; no se subirán archivos `.env` con credenciales. El destino de despliegue y el proveedor de base de datos quedan pendientes de decisión, pues aún no hay requisitos operativos comprobados.

## 7. Riesgos y controles

| Riesgo | Consecuencia | Mitigación propuesta |
|---|---|---|
| Routers mezclan reglas de negocio y SQL/integraciones | Acoplamiento, mantenimiento y pruebas difíciles | Responsabilidades por capa y revisión técnica de dependencias |
| Varios dominios comparten datos sin contratos claros | Duplicados, inconsistencias y acoplamiento | Contratos versionados y propietario definido por dominio |
| Datos personales de clientes o candidatos se exponen | Impacto de privacidad y seguridad | Acceso mínimo, autorización por recurso, minimización, secretos fuera del código y registros sin PII |
| CORS demasiado permisivo o confundirlo con seguridad | Uso inadecuado desde navegadores y falsa sensación de protección | Orígenes explícitos más autenticación/autorización de servidor |
| Intentar crear toda la IA y todas las integraciones desde el primer sprint | Retrasos y ausencia de entregas verificables | Primer incremento acotado; validar contratos y flujos humanos antes de automatizar |
| Basarse en herramientas legacy sin confirmar API/permisos | Diseño inviable | Investigación de conectores reales y contratos antes de implementar adaptadores |

## 8. Decisiones iniciales y cuestiones abiertas

**Propuesto ahora:** monorepo existente; única API FastAPI; routers por dominio; separación API/aplicación/dominio/infraestructura; contratos `/api/v1`; entorno configurable; CORS explícito; privilegios mínimos; pruebas futuras por módulo.

**No decidido aún:** motor y esquema de base de datos, proveedor de hosting, mecanismo específico de identidad, integración exacta con Zendesk/HubSpot, requisitos de latencia, infraestructura de búsqueda semántica, políticas de retención y alcance del primer endpoint funcional. El equipo debe validarlos antes de convertirlos en compromisos.

## 9. Verificación de alcance y siguiente paso

Este documento aborda las 7 tareas de ejecución y los 6 criterios de evaluación del proyecto: patrón justificado, estructura coherente, routers por dominio, decisiones técnicas, investigación oficial y separación de frontend/backend. **No constituye evidencia de instalación, pruebas de ejecución, despliegue ni integración real**.

Este entregable debe revisarse mediante PR hacia `main`, sin fusionar el PR anterior ni modificar código de aplicaciones.
