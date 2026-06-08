---
name: felix-game-quality
description: Thorough game QA workflow for Felix mini apps. Use after building or changing any game, simulation, animated toy, canvas/WebGL/SVG/DOM game surface, controls, physics, scoring, levels, menus, win/lose state, or interactive world. Covers Felix preview checks, optional state hooks, screenshots, console-error checks, and multi-step control verification.
---

# Felix Game Quality

Use this skill before telling a child a game is done. Game bugs are often invisible in code review: controls can feel wrong, entities can be off-screen, collisions can miss, and menus can trap the player. Verify by acting, pausing, observing, and adjusting.

## Felix Setup

Felix mini apps are already running with hot reload. You usually do not start or restart the server. Use `browser_snapshot`, `browser_screenshot`, `browser_logs`, and the browser action tools to play the changed behavior in the live preview.

Do not install test tools or ask the child to run commands. Use the tools already available in the Felix agent environment.

## Fast Game Test Mode

A real-time game keeps running on its own loop while you stop to think. If you click start, take a screenshot, then reason about the next step, a fast game (Snake, runners, shooters, anything that ends quickly) can be over before you look again, which traps you in a useless smoke-test loop.

When a game is too fast to smoke-test by hand, do not race the clock with live screenshots. Give the game a small deterministic test surface, then drive it with `browser_game`:

- `window.felixGame.pause()` / `window.felixGame.resume()`: freeze and unfreeze the game loop.
- `window.felixGame.step(frames)`: advance the game by a fixed number of frames while paused (default 1). `window.advanceTime(ms)` is accepted as a fallback.
- `window.render_game_to_text()`: returns concise JSON for the current playable state, used as the source of truth.
- Recommended: auto-pause on `visibilitychange`/`blur` so the game also freezes whenever you are not actively interacting.

Then verify race-free: `browser_game` with `action: "pause"`, read the returned state, `action: "step"` a few frames, read again. Use `render_game_to_text()` text state as the source of truth; use screenshots only on a paused or first frame. Slow or turn-based games do not need these hooks; smoke-test them normally.

The text state should include only current player-relevant state: mode, positions, velocities, active obstacles/enemies, collectibles, timers/cooldowns, score/resources, level, and win/lose flags. Include a coordinate-system note when useful.

Minimal pattern:

```js
let paused = false;
window.felixGame = {
  get paused() {
    return paused;
  },
  pause() {
    paused = true;
  },
  resume() {
    paused = false;
  },
  step(frames = 1) {
    for (let i = 0; i < frames; i += 1) update(FIXED_DT);
    render();
  },
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) window.felixGame.pause();
});

window.render_game_to_text = () =>
  JSON.stringify({
    mode: state.mode,
    player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy },
    score: state.score,
    level: state.level,
    entities: enemies.map((enemy) => ({ kind: enemy.kind, x: enemy.x, y: enemy.y })),
  });
```

Keep the game loop driven by a fixed timestep so `step(frames)` is deterministic.

## Verification Loop

1. Pick one behavior to verify: movement, jumping, launching, menu flow, scoring, collision, level change, win/lose, restart, etc.
2. Use browser action tools to perform the controls or clicks a player would use. For fast games, `browser_game` with `pause` then `step` instead of letting the loop run while you think.
3. Inspect text state from `browser_game`/`render_game_to_text()` first, then screenshots on a paused frame, plus console/page errors.
4. Review console/page errors. Fix the first new error before continuing.
5. Think through the full chain, not just the button press: cause, intermediate state, visible result, stored state, repeat behavior.
6. Reset between unrelated scenarios so state from one test does not fake another pass.
7. Rerun until the visuals, text state, and controls agree.

## Important Scenarios

Verify every scenario touched by the change:

- Start/menu flow, pause/resume, restart, and settings.
- Keyboard and mouse controls; touch/gamepad only when supported.
- Movement boundaries: walls, edges, camera limits, platforms, scrolling, portals.
- Score, health, inventory, ammo, timers, cooldowns, combo counters, and saved high scores.
- Collision chains: bump, bounce, collect, affect, remove, unlock, trigger.
- Win/lose transitions and replay from those states.
- Animation-heavy states after a few seconds, not only the first frame.
- Empty/fresh app state with no saved data.

## Visual Review

Screenshots are the source of truth. Confirm:

- The player and important objects are visible.
- Text is readable and not covering gameplay unintentionally.
- The first interactive control is obvious.
- Nothing important is clipped, transparent, or behind another layer.
- Fullscreen/resizing does not break input mapping when supported.

## Finish

Only after the game passes the relevant checks, tell the child what they can do now in one short, cheerful sentence. Keep testing details out of the final kid-facing reply unless the learning level invites a tiny aside.
