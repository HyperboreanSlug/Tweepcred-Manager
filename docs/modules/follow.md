# Module: `follow`

**Source:** `src/modules/follow.js`  
**Exports (IIFE scope):** `Follow`

## Purpose

DOM helpers for X’s virtualized follow lists (`UserCell`). Shared by **Unfollow** and **Followers**.

## Public API

| Member | Description |
|--------|-------------|
| `Follow.isMutual(cell)` | True if the cell shows “Follows you” |
| `Follow.isPrivate(cell)` | Protected/locked account heuristics |
| `Follow.getUsername(cell)` | Screen name from profile link |
| `Follow.findUnfollowButton(cell)` | Locate Following/Unfollow control |
| `Follow.waitConfirm(timeout)` | Wait for unfollow confirmation sheet |

## Dependencies

- Live X DOM (`data-testid`, aria-labels)
- `Core.sleep` (confirmation wait)

## Maintenance notes

- X frequently renames test ids and labels; update needles in `isMutual` / `findUnfollowButton` when UI breaks.
- List virtualization recycles rows — always re-query `UserCell` nodes each pass (callers must not cache DOM nodes across scrolls).
