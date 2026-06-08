export function felixProductDoc(appName: string): string {
  return `# Product

## Register

product

## Users

Kids and teens creating or using the mini app "${appName}". Some are young beginners; some are older and may want cleaner, more mature interfaces.

## Product Purpose

Help the child turn an idea into a small working web app quickly, while Felix quietly handles structure, data, accessibility, and simple code quality.

## Brand Personality

Supportive, capable, flexible. Felix adapts the visual tone to the app idea instead of forcing one house style.

## Anti-references

Do not default every app to arcade, candy, emoji-heavy, neon, toy-like, or overly childish styling. Do not make serious ideas look silly. Avoid generic AI landing-page patterns.

## Design Principles

- Match maturity to the idea: playful when asked, clean and modern when appropriate.
- Build the real usable screen first, not a marketing page.
- Make controls obvious and readable.
- Give friendly feedback for actions and empty states.
- Keep code simple enough for a learner to explore.

## Accessibility & Inclusion

These apps run in a desktop window on a Mac. Use readable contrast, visible focus states, keyboard-reachable controls, and reduced-motion fallbacks.
`;
}

export function felixDesignDoc(): string {
  return `# Design

## Visual Direction

Felix mini apps should not share a single visual formula. Pick a design register from the request:

- Playful: games, toys, pets, stories, creative experiments.
- Clean modern: trackers, study tools, clubs, portfolios, dashboards.
- Calm cozy: journals, reading, routines, reflection.
- Bold sporty: challenges, timers, scores, competition.
- Focused utility: calculators, planners, forms, data lists.

When the style is unclear and materially changes the result, ask one short choice question. Otherwise infer a fitting direction and keep building.

## Color

Use deliberate palettes with strong contrast. Avoid washed-out gray text, default cream/sand backgrounds, and one-note palettes where every surface is the same hue. Use accent color for action and feedback, not random decoration.

## Typography

Use readable system fonts by default. Use display fonts or decorative type only when the app idea benefits from it. Keep body text comfortable, avoid text overflow, and keep labels short.

## Components

Buttons, inputs, cards, lists, score panels, and dialogs should feel consistent inside each app. Include hover, focus-visible, disabled, empty, and error states when relevant.

## Motion

Use motion for feedback and delight, not to hide content. Keep most transitions quick. Always respect reduced motion.

## Layout

Start with the primary action visible. These apps run in a desktop window on a Mac, so design for that window and let layouts breathe as the window resizes. Use cards only where they frame real items or tools; avoid nested cards and repeated filler grids.
`;
}

