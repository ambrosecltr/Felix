---
name: felix-browser-preview
description: How to inspect and control Felix's live mini app preview. Use after creating or changing UI, games, controls, saving/loading flows, visual layout, or anything the child should be able to click, type into, read, or play.
---

# Felix Browser Preview

Felix mini apps are already running in the live desktop preview. Use the browser preview tools to check the app itself, not only the files.

## Core Tools

- `browser_snapshot`: read URL, title, viewport, visible text, interactive controls, optional `window.render_game_to_text()` output, and recent warnings/errors.
- `browser_screenshot`: inspect visual layout, canvas/SVG/WebGL output, clipping, readability, and coordinate mapping.
- `browser_logs`: check recent console messages and load errors.
- `browser_reload`: reload the app when testing fresh state, saved data, or recovery.
- `browser_click`, `browser_type`, `browser_key`, `browser_scroll`: run the same actions the child will use.
- `browser_move_cursor`: check hover or move Felix's visible cursor before an action.

## Verification Pattern

After changing code:

1. Use `browser_snapshot` to confirm the app loaded and to find main controls.
2. Use `browser_logs` and fix new warnings or errors.
3. Use `browser_screenshot` when visual output matters.
4. Use click/type/key/scroll tools to complete the main child-facing path at least once.
5. Reload if the change involves saved data, startup state, or first-run behavior.

## Coordinates

Click tools use viewport coordinates. `browser_screenshot` explains how to translate a screenshot point into viewport coordinates when the screenshot was scaled.

Prefer clicking the center of controls reported by `browser_snapshot`. If using a screenshot, calculate the coordinate from the note before clicking.

## Game State

For games, a small debug hook can help verification when it does not clutter the learner-facing code:

```js
window.render_game_to_text = () =>
  JSON.stringify({
    mode: state.mode,
    player: { x: player.x, y: player.y },
    score: state.score,
  });
```

Keep this hook concise and player-focused. It should describe current state, not dump the whole program.

## Finish Rule

Only tell the child the work is done after the preview loads, the main path works, and there are no new errors.
