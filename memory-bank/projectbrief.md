# Project Brief — Nexova Solutions

## Fuentes de verdad y prioridad
1. `BRIEFING.md`: contexto empresarial completo del escenario Chile + Argentina, procedente del repo de empresa de 4Geeks Academy.
2. `company-choice.md`: selección personal y enfoque del estudiante; propuestas aún no implementadas.
3. `README.md` y README de cada subcarpeta: responsabilidades técnicas y ubicación del código.

Existe otro `nexova-BRIEFING.es.md` en `ai-engineering-syllabus/content/contexts/00-general-contexts` que describe Valencia y Miami. Son variantes incompatibles. **No mezclar geografías ni sustituir datos sin una decisión documentada.** Este monorepo utiliza el escenario Chile + Argentina de su repositorio de origen.

## Negocio
Nexova Solutions es una consultora de RR. HH. y selección de talento, fundada en 2011, con operaciones en Chile y Argentina, 120 empleados y facturación anual aproximada de US$8 millones. Sus líneas son headhunting, outsourcing de soporte al cliente y formación corporativa. Fuente: `BRIEFING.md`.

## Dolor priorizado y oportunidad
El departamento de Soporte al Cliente Externalizado (Roberto Díaz) cuenta con 30 agentes, recibe solicitudes por teléfono, correo y chat, carece de base de conocimiento centralizada y registra 48 h promedio de resolución ante un SLA de 24 h. La visión propuesta en `company-choice.md` es un sistema de apoyo al soporte con RAG, clasificación, escalamiento humano y observabilidad, aspirando a automatizar 40 % de consultas sencillas cuando existan los datos y controles apropiados. **Esto es una hoja de ruta, no funcionalidad implementada ni compromiso de este hito.**

## Objetivo de este hito
Establecer infraestructura de contexto y gobernanza para agentes de desarrollo: `BRIEFING.md`, `memory-bank/`, `AGENTS.md`, una regla scoped y una skill verificable. No desarrollar apps, RAG, ticketing ni APIs en esta entrega.

## Restricciones de negocio
- No inventar métricas, integraciones, documentos internos, clientes ni resultados.
- Datos reales de personas/clientes: mínimo acceso, no publicar PII, credenciales o tickets reales.
- Mantener supervisión humana y verificación de fuentes para futuras respuestas automáticas.
- Cambios en prioridades, geografía, stack o alcance requieren decisión humana documentada.
