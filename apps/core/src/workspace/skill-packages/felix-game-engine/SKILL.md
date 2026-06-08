---
name: felix-game-engine
description: Comprehensive game-development guidance for Felix mini apps. Use when a child asks to build or improve any game, simulation, toy-like interactive world, 2D or 3D experience, engine system, physics/collision behavior, sprites, animation, controls, audio, levels, multiplayer, WebGL, Canvas, SVG, DOM-based game UI, or game publishing.
license: Adapted for Felix from GitHub awesome-copilot game-engine under MIT; see LICENSE.txt.
---

# Felix Game Engine

Build the game the child imagined, choosing the right rendering and interaction approach for the idea instead of forcing one default. Felix mini apps are Vite apps with plain JavaScript, HTML, and CSS; keep code readable for a learner while still reaching for richer web game techniques when the idea deserves them.

## First Decisions

Before coding, decide what kind of experience the child is asking for:

- **DOM/CSS game UI**: menus, quiz games, card games, board games, dress-up, clicker games, rhythm pads, inventory-heavy games.
- **SVG**: crisp vector worlds, maps, simple physics toys, scalable characters, puzzle boards, UI-heavy animation.
- **Canvas 2D**: sprite games, particle systems, arcade loops, tilemaps, drawing-heavy play, many moving objects.
- **WebGL or CSS 3D**: 3D-feeling worlds, cameras, lighting, depth, shaders, model-like objects, immersive scenes.
- **Hybrid**: canvas or WebGL for the playfield, DOM for menus, settings, inventory, scoreboards, and accessible controls.

Do not default to a reduced 2D canvas version unless that is the best fit. If a child asks for something large, build a delightful vertical slice that proves the fantasy: movement, feedback, a goal, and one memorable interaction.

## Felix Constraints

- The app is already running with hot reload; edit `index.html`, `main.js`, and `style.css`.
- Keep content age-appropriate for kids around 6 to 12.
- Prefer local code-generated assets, SVG, CSS art, Web Audio, or bundled assets over fragile hotlinks.
- Do not add external game frameworks, remote scripts, package installs, external example projects, or platform tooling to a child-facing mini app.
- Use `felix-game-quality` before saying a game is done.

## Core Workflow

1. Clarify the fantasy in one sentence: what the player does, what responds, and what feels fun.
2. Choose the rendering stack deliberately: DOM/SVG/Canvas/WebGL/CSS-3D/hybrid.
3. Create the smallest playable loop: start state, input, update, render, feedback, reset.
4. Add game state explicitly: mode, player, entities, score/resources, timers, level, win/lose.
5. Build controls for keyboard and mouse by default; add touch/gamepad only when useful.
6. Make the screen legible: visible player, readable state, clear affordances, no hidden-only-hover controls.
7. Add juice where it matters: animation, particles, sound, camera motion, squash/stretch, lighting, or transitions.
8. Verify it by playing and by using `felix-game-quality` for interaction/state checks.

## Reference Map

Load the relevant file instead of trying to remember everything:

- `references/basics.md`: game anatomy, loops, planning, and broad concepts.
- `references/web-apis.md`: Canvas, WebGL, Web Audio, Gamepad, workers, storage, fullscreen.
- `references/techniques.md`: collision, tilemaps, sprites, animation, audio, loading.
- `references/3d-web-games.md`: local browser 3D, CSS perspective, Canvas projection, and raw WebGL.
- `references/game-control-mechanisms.md`: keyboard, mouse, touch, device sensors, gamepads.
- `references/algorithms.md`: raycasting, pathfinding, collision, vectors, physics, procedural generation.
- `references/game-engine-core-principles.md`: engine architecture, entity/component thinking, timing, resources.
- `references/terminology.md`: glossary for game-development terms.
- `references/game-publishing.md`: packaging, distribution, portals, sharing. For Felix, keep sharing/publishing adult-supervised and age-appropriate.

## Quality Bar

A Felix game should have:

- A playable first screen, not a landing page.
- Clear controls and visible feedback for every action.
- A goal, toy loop, or creative affordance that works repeatedly.
- Reset/restart behavior for any fail/win state.
- No blank screen if saved data or assets are missing.
- A visual direction that matches the child’s idea rather than a generic arcade skin.
