# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Despacho Manager is a warehouse picking/order-dispatch management tool. Users upload a PDF or image of a shipping order; a Firebase Cloud Function calls the Anthropic API (Claude Haiku) to extract the product list as JSON; the user then picks items from that list while progress syncs in real time via Firestore.

## Commands

### Frontend
No build step — `index.html` is the complete frontend. Open it directly in a browser or via the Firebase Hosting emulator.

### Cloud Function (in `functions/`)
```bash
npm run serve    # start local emulator (functions only)
npm run deploy   # deploy function to Firebase
npm run logs     # tail live function logs
```

### Full deployment
```bash
firebase deploy --only hosting          # deploy frontend
firebase deploy --only functions        # deploy Cloud Function
firebase deploy                         # deploy both
```

### Firebase emulator (full local stack)
```bash
firebase emulators:start
```

## Architecture

### Single-file SPA (`index.html`)
All CSS, HTML, and JavaScript live in one file — no bundler, no framework. The JS runs as an ES module (`<script type="module">`). State lives in module-level variables:

- `db` / `fbMod` — Firestore instance and Firebase module imports (loaded dynamically from CDN)
- `curId` / `curData` — the currently open despacho
- `parsedProducts` — products extracted from the uploaded document, held in memory during creation flow
- `isLocal` — flag for localStorage-only mode (no Firebase)
- `currentUser` — name string, persisted to `localStorage` under `dspmgr_user_v1`

**Screens** are `<div class="scr">` elements; `showScreen(id)` toggles the `.on` class. Screens: `s-setup` → `s-home` → `s-new` or `s-pick`.

**localStorage keys**: `dspmgr_v1` (local orders), `dspmgr_cfg_v1` (Firebase config), `dspmgr_user_v1` (current user name), `dspmgr_team_v1` (team members in local mode).

### Cloud Function (`functions/index.js`)
Single exported function `parseDocument` (HTTP, POST). Receives `{base64Data, mediaType}`, calls `api.anthropic.com/v1/messages` using `claude-haiku-4-5`, and returns `{header, products}`. The Anthropic key comes from `process.env.ANTHROPIC_KEY` (set in `functions/.env`).

The live endpoint is `https://parsedocument-aqd2rvesuq-uc.a.run.app`. The frontend calls this URL directly from `aiExtractProducts()` in `index.html`.

### Firestore schema
- **Collection `despachos`**: each document is one order. Fields: `name`, `orderNumber`, `orderDate`, `origin`, `destination`, `products[]`, `checked{}`, `assignedTo`, `createdBy`, `createdAt`, `lockedBy`, `lockedAt`.
  - `checked` maps `productId → {done, time, note}`
  - `lockedBy`/`lockedAt` implement a 2-hour soft lock to warn about concurrent editing
- **Document `config/team`**: `{members: string[]}` — the shared team member list

### Deployment / CI
Pushing to `main` triggers `.github/workflows/deploy.yml`, which deploys only Firebase Hosting (frontend). Cloud Function deploys are manual.

## Contexto del negocio

- Fernando Figueroa, Gerente Operativo de distribución
- 1 bodega principal → 1 bodega secundaria + 6 sucursales
- Equipo de 1 a 10 personas por día
- Proceso actual: emitir reportes PDF → leer → decidir acciones de distribución
- Usuarios acceden desde celulares y laptops

## Reglas de desarrollo

- Nunca mostrar el archivo completo al hacer cambios, solo bloques exactos a modificar
- No usar frameworks externos (sin React, sin Vue)
- Respetar variables CSS `:root` existentes
- Priorizar usabilidad en móvil
- Al terminar cambios importantes ejecutar: `firebase deploy --only hosting`

## Key Constraints

- The frontend Firebase config is hardcoded at the bottom of `index.html` (public web config — intentional).
- `functions/.env` holds `ANTHROPIC_KEY` and is git-ignored; never commit it.
- The AI extraction has a 3-retry loop with exponential backoff and a 2-minute per-attempt timeout.
- Product names are always stored and displayed in uppercase.
- `qty` is always a positive integer; `family` defaults to `"General"` if missing.
