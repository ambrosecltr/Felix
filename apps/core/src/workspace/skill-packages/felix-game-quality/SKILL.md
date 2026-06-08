---
name: felix-game-quality
description: Thorough game QA workflow for Felix mini apps. Use after building or changing any game, simulation, animated toy, canvas/WebGL/SVG/DOM game surface, controls, physics, scoring, levels, menus, win/lose state, or interactive world. Covers Browser/manual checks, optional state hooks, screenshots, console-error checks, and multi-step control verification.
---

# Felix Game Quality

Use this skill before telling a child a game is done. Game bugs are often invisible in code review: controls can feel wrong, entities can be off-screen, collisions can miss, and menus can trap the player. Verify by acting, pausing, observing, and adjusting.

## Felix Setup

Felix mini apps are already running with hot reload. You usually do not start or restart the server. Find the current preview URL from the app context or existing process, then use the Browser plugin or direct rendered inspection to play the changed behavior.

Do not install test tools or ask the child to run commands. Use the tools already available in the Felix agent environment.

## Instrumentation Hooks

Prefer adding these hooks to games when it does not make the learner-facing code too noisy:

- `window.render_game_to_text()`: returns concise JSON for the current playable state.
- `window.advanceTime(ms)`: steps the game deterministically for tests when the game loop supports it.

The text state should include only current player-relevant state: mode, positions, velocities, active obstacles/enemies, collectibles, timers/cooldowns, score/resources, level, and win/lose flags. Include a coordinate-system note when useful.

Minimal pattern:

```js
window.render_game_to_text = () =>
  JSON.stringify({
    mode: state.mode,
    player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy },
    score: state.score,
    level: state.level,
    entities: enemies.map((enemy) => ({ kind: enemy.kind, x: enemy.x, y: enemy.y })),
  });
```

## Verification Loop

1. Pick one behavior to verify: movement, jumping, launching, menu flow, scoring, collision, level change, win/lose, restart, etc.
2. Use Browser/manual actions to perform the controls or clicks a player would use.
3. Inspect screenshots, visible state, and console/page errors.
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
