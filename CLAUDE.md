# CLAUDE.md — Despacho Ordenes

Archivo de convenciones para Claude Code. Leer antes de cualquier tarea.

## Contexto del proyecto
App web operativa de bodega. Usuarios: pickers con celular Android/iOS,
a veces con guantes, bajo presión de tiempo. También supervisores en laptop.
Stack: HTML + CSS + JS vanilla en un solo archivo index.html. Sin frameworks.

## Reglas de desarrollo
- Todo el frontend vive en index.html (+ ops.html, moto.html para módulos separados)
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
- Colección principal: despachos/{id}
- Config de equipo: config/team
- Siempre manejar errores de red con feedback visual al usuario

## Para cambios en Cloud Functions
Indicarlo por separado — no modificar index.html por esos cambios.
