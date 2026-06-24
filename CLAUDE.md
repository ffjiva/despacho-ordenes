# CLAUDE.md — Despacho Ordenes

Archivo de convenciones para Claude Code. Leer antes de cualquier tarea.

El estado real y la cola priorizada del proyecto viven en ROADMAP.md —
leerlo primero.

## Contexto del proyecto
App web operativa de bodega. Usuarios: pickers con celular Android/iOS,
a veces con guantes, bajo presión de tiempo. También supervisores en laptop.
Stack: HTML + CSS + JS vanilla, una app standalone por archivo (index.html,
ops.html, moto.html, reposicion.html). Sin frameworks, sin build step.

## Reglas de desarrollo
- Cada app vive en su propio archivo standalone: index.html, ops.html,
  moto.html, reposicion.html
- Sin frameworks externos (sin React, sin Vue, sin jQuery)
- Respetar variables CSS del :root existente — nunca hardcodear colores
- Priorizar usabilidad móvil antes que desktop
- Mostrar solo el bloque exacto a modificar, nunca el archivo completo

## Design System — reglas activas

### Tokens existentes (no modificar sin justificación)
- Fuentes: IBM Plex Mono (primaria) + IBM Plex Sans
- Dark theme base: --bg #1a1a14, --surface #242418, paleta olive-black
- Acento funcional: --accent2 #7bc44a (verde lima = "completado")
- Semántica de color: done/warn/err/info — respetar en todos los componentes
- Radios: --r 6px, --r2 10px

### Principios de diseño para esta app
- INDUSTRIAL/UTILITARIO: claridad operativa sobre estética decorativa
- Tapzones mínimos 44px en móvil — app se usa con dedos, a veces con guantes
- Contraste alto en elementos interactivos — entornos de bodega con luz variable
- Tipografía funcional: IBM Plex Mono da identidad técnica, mantenerla
- Animaciones solo donde aporten feedback operativo (check de item, carga, error)
- Sin decoración superflua: sin gradientes innecesarios, sin sombras pesadas

### Al crear o modificar componentes visuales
1. Usar siempre variables CSS del :root — nunca valores hardcodeados
2. Verificar que funcione en 375px de ancho (iPhone SE / Android entry-level)
3. Estados interactivos explícitos: hover, active, disabled, loading
4. Consistencia con componentes existentes: .btn, .badge, .ic, .dcard, .box

## Firestore / Firebase
- Colecciones: despachos, users, vueltas, domicilios, reposiciones,
  inventarios (esquema completo en ROADMAP.md)
- Usuarios y roles: users/{uid} (role: super | collaborator | motorista)
- config/team está DEPRECADO — NO usar como fuente de usuarios (solo
  persiste por tokens FCM legacy)
- Siempre manejar errores de red con feedback visual al usuario

## Flujo de deploy (obligatorio)
Siempre en este orden — nunca saltarse el commit:
1. `git add <archivos>`
2. `git commit -m "..."`
3. `firebase deploy --only hosting` y/o `firebase deploy --only functions`

Si se deploya antes de commitear, Firebase verá el código como "sin cambios"
en el siguiente deploy y lo saltará silenciosamente (bug difícil de detectar).

## Para cambios en Cloud Functions
Indicarlo por separado — no modificar index.html por esos cambios.
