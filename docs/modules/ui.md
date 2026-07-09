# Module: `ui`

**Source:** `src/modules/ui.js`  
**Exports (IIFE scope):** `UI`

## Purpose

Single draggable, minimizable dark-glass panel. Builds chrome, tabs, shared CSS, and routes tab switches to feature modules.

## Public API

| Member | Description |
|--------|-------------|
| `UI.build()` | Mount `#tpm-panel` |
| `UI.switchTab(name)` | Activate pane + call module `onShow` |
| `UI.el(id)` | `getElementById` helper |
| `UI.styles()` | Injected `<style>` for the panel |
| `UI.makeDraggable(panel, header)` | Pointer-based drag |

## Tabs

`dashboard` · `unfollow` · `followers` · `cleanup` · `about`

Pane ids: `#tpm-pane-<tab>`.

## Dependencies

- `Dashboard`, `Unfollow`, `Followers`, `Cleanup`, `About` (tab hooks)
- Document body for insertion

## Maintenance notes

- Prefer shared CSS classes (`tpm-section`, `tpm-btn`, …) over per-module global styles.
- Feature-specific CSS may be appended inside `styles()` with a short comment.
- Closing the panel sets `window.__tpmRunning = false` so a re-paste/re-run can rebuild.
