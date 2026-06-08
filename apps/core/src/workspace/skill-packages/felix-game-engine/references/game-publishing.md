# Felix Game Sharing And Packaging

Use this reference when a child wants to share, export, or polish a game for others to play. Felix is not a commercial publishing workflow; anything public, account-based, or money-related must be handled by a trusted adult outside the child-facing build session.

## Felix-Safe Principles

- Keep the game age-appropriate and friendly.
- Do not add ads, in-app purchases, tracking, external accounts, chat, leaderboards, or payment systems for a child.
- Do not ask for personal information.
- Prefer local, bundled, or code-generated assets so the game still works offline.
- If public sharing is requested, tell the child a trusted grown-up should help.

## Pre-Share Checklist

Before sharing a Felix game:

- The first screen explains the goal and controls.
- The core loop works repeatedly.
- Win, lose, pause, restart, and reset states work when present.
- Saved data has a friendly empty state.
- The game loads without console errors.
- Text is readable and controls are visible in the default desktop window.
- The game still works with the network disabled unless the project explicitly requires network features.

## Packaging Basics

For Felix mini apps, packaging usually means making sure the Vite app is self-contained:

- Keep assets in the project rather than hotlinking them.
- Avoid runtime dependencies on external hosts.
- Use relative paths for local files.
- Do not store secrets or credentials in app code.
- Run the normal build/check flow available to the workspace before distribution.

## Sharing Options

### Local Demo

Best for Felix. The child can show the running app on the same Mac. This avoids accounts, public links, and privacy concerns.

### Family Or Classroom Sharing

Appropriate only with adult help. A grown-up can decide whether the app is ready and where it should be shared.

### Public Web Publishing

Only with adult supervision. Public publishing requires privacy, copyright, moderation, and safety decisions outside the mini app itself.

## Polish For Others

When someone else will play:

- Add a clear title and start button.
- Include controls on the menu or pause screen.
- Make mistakes forgiving with restart/undo when possible.
- Add gentle audio feedback only after user interaction.
- Keep the game usable without reading a long explanation.

## What Not To Add

For Felix child-facing apps, skip:

- Advertising or sponsorship code.
- Payments, purchases, subscriptions, or virtual currency.
- Public chat, public comments, or uncontrolled user-generated content.
- Analytics or tracking.
- External account creation.
