# Module: `bootstrap` / `boot` / packaging

## `src/bootstrap.js`

Opens the IIFE, enforces single-instance via `window.__tpmRunning`, resurfaces existing panel on re-run.

## `src/boot.js`

Calls `Core.init()`, `UI.build()`, renders all feature tabs, switches to Dashboard, logs ready line.

## `src/footer.js`

Closes the IIFE.

## `src/header.meta.js`

Userscript metadata block (`@match`, `@grant none`, `@run-at document-idle`) plus human banner. Same file works for:

- **Greasemonkey / Tampermonkey / Violentmonkey** install
- **Console paste** (metadata lines are comments; ignored)

## Build

```bash
node scripts/build.js
```

Writes:

- `dist/tweepcred-manager.user.js` — install or paste
- `tweepcredmanager.js` — root compat copy
