---
name: felix-frontend-design
description: Distinctive frontend design guidance for Felix mini apps. Use when creating, redesigning, beautifying, or polishing any Felix app, component, page, dashboard, game UI, creative tool, tracker, quiz, poster-like screen, HTML/CSS layout, or interactive interface that needs strong visual direction and production-quality polish while staying age-appropriate for children.
license: Adapted for Felix from Anthropic frontend-design under Apache-2.0; see LICENSE.txt.
---

# Felix Frontend Design

Create Felix mini apps that feel intentionally designed for the child's idea, not stamped from a generic AI template. The goal is imagination with craft: distinctive, polished, usable interfaces that still respect Felix's safety, readability, and learning constraints.

## Design Thinking

Before coding, choose a clear aesthetic direction:

- **Purpose**: What does this app let the child do, make, learn, track, play, or show?
- **Audience and maturity**: Is this for a younger child, an older kid, a club, a school tool, a personal creative project, or a game?
- **Tone**: Pick a committed direction: crisp science lab, sports broadcast, cozy notebook, sketchbook collage, space-console, trading-card binder, museum placard, music studio, soft toy-like, editorial, arcade, brutalist, art deco, nature field guide, industrial utility, etc.
- **Differentiation**: What is the one visual or interaction idea someone will remember?
- **Constraints**: Felix apps are Vite + plain HTML/CSS/JS, usually desktop-window first, and must stay age-appropriate.

Bold maximalism and refined minimalism can both work. The point is intentionality, not volume.

## Felix Design Rules

- Build the actual usable/playable surface first, not a marketing landing page.
- Do not make every child app candy-colored, emoji-heavy, neon, or arcade-like.
- Do not make serious ideas look silly.
- Keep important controls obvious and keyboard-accessible.
- Use readable contrast and visible focus states.
- Respect `prefers-reduced-motion`.
- Avoid fragile remote images, audio, or fonts unless the project explicitly supports them.
- Keep app copy short and concrete.

## Aesthetic Craft

Focus on:

- **Typography**: Use readable system fonts by default when clarity matters. Use a more distinctive display style only when it strengthens the concept and can be implemented locally/reliably.
- **Color and theme**: Commit to a palette with roles: background, surface, text, accent, feedback. Avoid timid evenly distributed colors and avoid one-note hue washes unless the concept earns it.
- **Composition**: Use layout to express the idea: dense scoreboard, quiet writing space, playful board, instrument panel, gallery wall, lab bench, map, stage, timeline, card table.
- **Visual details**: Add meaningful texture, borders, shadows, pattern, illustration, CSS/SVG art, or motion that belongs to the app's world.
- **Motion**: Use a few purposeful moments: button feedback, reveal, win state, save confirmation, object movement, drag/drop affordance.
- **State design**: Empty, loading, saved, error, win, lose, paused, and reset states should all look intentional.

## Avoid Generic AI Aesthetics

Rewrite before shipping if the UI relies on:

- Purple-blue gradient hero sections by default.
- Repeated cards with icon, heading, paragraph, and no real function.
- Tiny uppercase eyebrow labels everywhere.
- Decorative glass panels everywhere.
- Generic dashboard dark navy or beige SaaS palettes without a reason.
- Placeholder copy, fake controls, broken images, or buttons that do nothing.
- Text overflow or controls that only work on hover.

## Implementation Guidance

1. Pick the visual direction before touching CSS.
2. Define CSS variables for core roles and spacing.
3. Build the primary workflow in view immediately.
4. Style real states, not only the happy path.
5. Add interaction feedback after the structure works.
6. Check the rendered result, not just the code.

## Relationship To Other Felix Skills

- Use `felix-design-style` for Felix's baseline UI rules and finish check.
- Use `felix-game-engine` for game-specific rendering and interaction decisions.
- Use `felix-game-quality` for game-specific verification.
- Use `felix-build-quality` before saying the change is done.

Tell the child the visible result in one short sentence. Keep design theory out of the kid-facing response unless the learning level invites a tiny aside.
