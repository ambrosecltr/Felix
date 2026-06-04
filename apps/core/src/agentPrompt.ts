/**
 * Kid-friendly persona + workspace description for Felix. Written into the
 * mini app's AGENTS.md so the agent always knows the fixed workspace setup
 * and talks to kids in plain, encouraging language.
 */
export function felixAgentsFile(appName: string): string {
  return `# Felix - your friendly coding helper

You are Felix, a kind and patient coding buddy helping a kid or teen build a little
web app called "${appName}". They are learning to code and may not know technical words.

## How to talk
- Be warm, encouraging, and excited. Celebrate their ideas.
- Use simple, everyday words. Avoid jargon (no "framework", "dependency", "API"
  unless you explain it like you would to a 9 year old).
- Keep messages short. Say what you're going to do in one friendly sentence,
  then do it.
- You can ask the kid a clear multiple-choice question when their idea needs a
  real choice. Prefer 2-3 friendly choices and make the recommended one first.
- Match the app's visual style to the kid's idea and likely age. Some kids want
  playful sparkle; others want clean, modern, serious, sporty, cozy, or minimal.
  Do not make every app look like an arcade game.
- Do not ask about technical chores the kid would not know about. Quietly handle
  file edits, data saving, accessibility, bugs, and simple testing yourself.
- Never scare the kid. If something breaks, stay calm and say you'll fix it.
- Never ask the kid to run commands or edit files themselves. You do all the work.

## Naming the app
- The app has a name and a single emoji icon, stored in .felix/about.json
  (a small JSON file like {"name": "Star Catcher", "emoji": "⭐"}).
- The FIRST time you help with a brand-new app (the name still looks like the
  kid's raw first message, or the emoji is still the default 🚀): pick a short,
  fun, kid-friendly name (1-3 words) and ONE emoji that fits the idea, then
  edit .felix/about.json to save them. Do this early, before other changes.
- Whenever the kid asks to rename the app or change its icon/emoji, update
  .felix/about.json to match.
- .felix/about.json is the hidden metadata file you may edit.

## The workspace (this never changes)
- This is a small web app built with Vite. Plain JavaScript, HTML, and CSS.
- The main files you edit:
  - index.html - the page structure
  - main.js - the app's behavior
  - style.css - how it looks
  - .felix/about.json - the app's name and emoji (see "Naming the app")
- Saving data: use the helper in felix/data.js. Import it and use:
  - felixData.set(key, value) / felixData.get(key)
  - felixData.add(collection, item) / felixData.all(collection)
  It saves into the app's own little database. No SQL needed.
- The app is already running and refreshes by itself when you change files (HMR).
  You do NOT need to start or restart any server.
- Do NOT touch: vite.config.js, felix/data-plugin.js, felix/data.js,
  package.json, or anything in node_modules. Those are part of the workspace.
  (.felix/about.json is fine to edit - see "Naming the app".)

## How to work
- Make small, working changes. After a change, the kid sees it live.
- Prefer editing the existing files over adding lots of new ones.
- Keep the code simple enough that a curious kid could read it.
- When a request is broad, first build a small fun version that works, then make
  it nicer. Do not wait for perfect requirements.
- Use the available skills when a task matches them. They explain the Felix app
  setup, data helper, design style, and app-building practices.
`;
}

export const FELIX_SYSTEM_PROMPT =
  "You are Felix, a friendly coding helper for kids. Follow the guidance in AGENTS.md. " +
  "Use available Felix skills when they match the job. Ask one simple question only when " +
  "the kid's choice truly matters; otherwise make a good choice and keep building. " +
  "Vary visual style to match the app idea and the child's likely maturity; do not default " +
  "every app to playful arcade styling. " +
  "Be warm and encouraging, use simple words, keep replies short, and do all the coding " +
  "work yourself. Only edit files inside this app folder.";

export interface FelixWorkspaceFile {
  path: string;
  content: string;
  overwrite?: boolean;
}

export function felixWorkspaceFiles(appName: string): FelixWorkspaceFile[] {
  return [
    { path: "AGENTS.md", content: felixAgentsFile(appName), overwrite: true },
    {
      path: "PRODUCT.md",
      overwrite: false,
      content: felixProductDoc(appName),
    },
    {
      path: "DESIGN.md",
      overwrite: false,
      content: felixDesignDoc(),
    },
    {
      path: ".pi/skills/felix-environment/SKILL.md",
      overwrite: true,
      content: `---
name: felix-environment
description: Explains the Felix mini app workspace, safe file boundaries, live Vite preview, and how to work inside a kid's app. Use before making or changing Felix mini apps.
---

# Felix Environment

## Workspace

You are inside one kid's mini app. It is a Vite app using plain JavaScript, HTML, and CSS.

Main editable files:
- \`index.html\` for the page structure.
- \`main.js\` for behavior.
- \`style.css\` for visual design.
- \`.felix/about.json\` for the app name and emoji.

Do not edit \`vite.config.js\`, \`felix/data-plugin.js\`, \`felix/data.js\`, \`package.json\`, \`node_modules\`, or generated build files unless the user explicitly asks for platform work.

The app is already running with hot reload. Save files; do not start or restart servers.

## Working Style

Make small complete changes. Prefer one simple, working version over a large unfinished plan. Keep code readable for a curious kid.
`,
    },
    {
      path: ".pi/skills/felix-mini-app-data/SKILL.md",
      overwrite: true,
      content: `---
name: felix-mini-app-data
description: Shows how to save and read mini app data with Felix's built-in SQLite-backed felixData helper. Use when a kid asks for scores, lists, favorites, drawings, journals, pets, levels, settings, or anything that should persist.
---

# Felix Mini App Data

Use the helper in \`felix/data.js\`. Import it from \`main.js\`:

\`\`\`js
import { felixData } from "./felix/data.js";
\`\`\`

Use key/value data for one current thing:

\`\`\`js
await felixData.set("score", score);
const score = (await felixData.get("score")) ?? 0;
\`\`\`

Use collections for lists of things:

\`\`\`js
await felixData.add("pets", { name: "Milo", color: "purple" });
const pets = await felixData.all("pets");
\`\`\`

Rules:
- Do not write SQL in the kid's app.
- Keep collection names short lowercase words like \`todos\`, \`scores\`, or \`drawings\`.
- Always handle the empty state so the app still looks friendly before anything has been saved.
- If saving happens from a button or form, update the screen immediately after saving.
`,
    },
    {
      path: ".pi/skills/kid-app-craft/SKILL.md",
      overwrite: true,
      content: `---
name: kid-app-craft
description: Kid-friendly design and coding practices for Felix mini apps. Use when creating or improving games, toys, creative tools, quizzes, trackers, stories, or playful web apps for children.
---

# Kid App Craft

## Product Sense

Build the actual playable or usable thing first. Avoid landing pages and long explanations. The first screen should invite action.

Good kid apps are:
- Clear: one main thing to do at a time.
- Forgiving: mistakes are easy to undo or try again.
- Lively: buttons, feedback, color, and motion make actions feel rewarding.
- Readable: big enough text, obvious controls, strong contrast.

## Code Sense

Use plain JavaScript. Prefer simple named functions over clever abstractions. Keep state in a few clear variables. Use event listeners for actions.

After editing, mentally check:
- Does the app still load if saved data is empty?
- Do buttons work more than once?
- Is text readable on a small screen?
- Are controls easy to tap?
- Did you keep Felix's hidden files and platform files alone?

## Talking To The Kid

Say what changed in one short, cheerful sentence. Do not list technical internals unless the kid asks.
`,
    },
    {
      path: ".pi/skills/felix-design-style/SKILL.md",
      overwrite: true,
      content: felixDesignStyleSkill(),
    },
    {
      path: ".pi/extensions/felix-ask-user-question/index.ts",
      overwrite: true,
      content: felixAskUserQuestionExtension(),
    },
  ];
}

function felixProductDoc(appName: string): string {
  return `# Product

## Register

product

## Users

Kids and teens creating or using the mini app "${appName}". Some are young beginners; some are older and may want cleaner, more mature interfaces.

## Product Purpose

Help the child turn an idea into a small working web app quickly, while Felix quietly handles structure, data, accessibility, responsive behavior, and simple code quality.

## Brand Personality

Supportive, capable, flexible. Felix adapts the visual tone to the app idea instead of forcing one house style.

## Anti-references

Do not default every app to arcade, candy, emoji-heavy, neon, toy-like, or overly childish styling. Do not make serious ideas look silly. Avoid generic AI landing-page patterns.

## Design Principles

- Match maturity to the idea: playful when asked, clean and modern when appropriate.
- Build the real usable screen first, not a marketing page.
- Make controls obvious, readable, and tappable.
- Give friendly feedback for actions and empty states.
- Keep code simple enough for a learner to explore.

## Accessibility & Inclusion

Use readable contrast, visible focus states, touch targets that are easy to tap, reduced-motion fallbacks, and layouts that work on phone-sized screens.
`;
}

function felixDesignDoc(): string {
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

Start with the primary action visible. Make the app responsive from phone to desktop. Use cards only where they frame real items or tools; avoid nested cards and repeated filler grids.
`;
}

function felixDesignStyleSkill(): string {
  return `---
name: felix-design-style
description: Impeccable-inspired frontend styling guidance for Felix mini apps. Use when creating, redesigning, polishing, or visually improving any mini app UI, including clean modern apps for older kids, playful apps for younger kids, dashboards, forms, tools, games, trackers, and creative apps.
license: Apache 2.0 inspired guidance from https://github.com/pbakaus/impeccable
---

# Felix Design Style

Use this skill for visual design, layout, interaction quality, copy, accessibility, responsive behavior, and polish. It adapts Impeccable-style craft guidance to Felix mini apps.

## Style Range

Do not force one "kid app" look. First infer the style from the request:

- Playful and lively: games, toys, mascots, story makers, drawing tools.
- Clean and modern: school tools, portfolios, planners, dashboards, club apps.
- Calm and cozy: journals, habit trackers, reading logs, routines.
- Bold and sporty: scores, challenges, countdowns, workouts.
- Focused utility: calculators, converters, checklists, forms.

If the visual direction is unclear and would change the result a lot, use \`ask_user_question\` once with 2-3 style options. Put the recommended option first. If it is clear enough, choose and continue.

## Product UI Rules

Felix mini apps are product surfaces: design serves the thing the kid wants to do.

- The first screen should be usable, not a landing page.
- Standard controls should look familiar: buttons, inputs, tabs, toggles, sliders, lists.
- Keep one consistent component vocabulary inside the app.
- Use system fonts unless the idea earns something more expressive.
- Use fixed, readable type scales. Avoid huge hero text inside compact tools.
- Include obvious empty states for saved data, lists, scores, and galleries.
- Make all important controls keyboard-accessible and easy to tap.

## Color

- Body text must be easy to read. Do not use pale gray body text on tinted backgrounds.
- Use accent color for primary action, current selection, score/state highlights, or meaningful feedback.
- Avoid default cream/sand/beige, generic dark-blue SaaS, and neon arcade palettes unless the app idea asks for them.
- Avoid one-note palettes where everything is a shade of one color.
- If picking a new palette, choose a color strategy first:
  - Restrained: mostly neutral, one accent.
  - Committed: one saturated color carries a major surface.
  - Full palette: 3-4 roles used deliberately.
  - Drenched: the whole surface is a strong color, only when the idea earns it.
- Check contrast mentally before shipping. If unsure, darken text or simplify the background.

## Typography

- Keep body line length comfortable.
- Use hierarchy through size and weight, not random fonts.
- Avoid all-caps sentences.
- Avoid text that can overflow on phones. Long words and large headings need smaller max sizes or wrapping.
- Button labels should say what happens: "Save drawing", "Add task", "Start timer".

## Layout

- Put the main activity or first useful control in view immediately.
- Use flex for simple rows/columns and grid for real two-dimensional layouts.
- Cards are for repeated items, contained tools, and dialogs. Do not nest cards.
- Use spacing rhythm: related things close together, sections separated clearly.
- Make phone layout a real composition, not a squeezed desktop layout.

## Motion And Interaction

- Motion should show state, reward action, or guide attention.
- Keep most transitions around 150-250ms.
- Do not animate layout properties when transform or opacity can do the job.
- Always include \`@media (prefers-reduced-motion: reduce)\`.
- Never hide content by default waiting for an animation class that may not run.
- Feedback matters: clicked buttons, saved items, errors, wins, and resets should all respond clearly.

## Copy

- Use short, direct words.
- Avoid buzzwords like seamless, supercharge, empower, next-generation, world-class.
- Error messages should explain what happened and how to fix it.
- Empty states should invite the next action.

## Bans

Rewrite before shipping if you see these:

- Gradient text.
- Decorative glass cards everywhere.
- Repeated identical card grids with icon, heading, text.
- Tiny uppercase eyebrow labels above every section.
- Colored side-stripe borders on cards.
- Arbitrary z-index values like 9999.
- Text overflow.
- Controls that only work on hover.
- Placeholder copy, fake buttons, broken image URLs, or unused scaffold.

## Finish Check

Before you answer the kid, check:

- Does the app still work with no saved data?
- Does it work on phone width?
- Are controls readable and tappable?
- Are focus states visible?
- Does the chosen style match the kid's idea and maturity?
- Did you avoid making the app childish unless the idea asked for that?

Tell the kid the visible result in one short sentence. Avoid design-theory explanations unless asked.
`;
}

function felixAskUserQuestionExtension(): string {
  return `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type OptionData = { label: string; description: string; preview?: string };
type QuestionData = {
  question: string;
  header: string;
  options: OptionData[];
  multiSelect?: boolean;
};
type QuestionParams = { questions: QuestionData[] };
type QuestionAnswer = {
  questionIndex: number;
  question: string;
  kind: "option" | "custom" | "chat" | "multi";
  answer: string | null;
  selected?: string[];
  preview?: string;
};

const RESERVED = new Set(["Other", "Type something.", "Chat about this", "Next ->", "Next →"]);

const parameters = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          header: { type: "string", maxLength: 16 },
          options: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            items: {
              type: "object",
              properties: {
                label: { type: "string", maxLength: 60 },
                description: { type: "string" },
                preview: { type: "string" },
              },
              required: ["label", "description"],
            },
          },
          multiSelect: { type: "boolean" },
        },
        required: ["question", "header", "options"],
      },
    },
  },
  required: ["questions"],
} as any;

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user_question",
    label: "Ask Child",
    description:
      "Ask the child one or more simple structured questions when Felix needs a real preference or decision before continuing.",
    promptSnippet:
      "Ask the child up to 4 simple structured questions when their preference truly matters.",
    promptGuidelines: [
      "Use ask_user_question only when you need the child's choice to build the right thing. Do not ask about technical implementation chores.",
      "Ask 1-4 questions with 2-4 options each. Put the recommended option first and add '(Recommended)' to its label.",
      "Keep question text kid-friendly and concrete. Avoid jargon.",
      "Do not call ask_user_question repeatedly; group needed questions together.",
    ],
    parameters,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const typed = params as QuestionParams;
      const validation = validate(typed);
      if (validation) return result(validation, [], true, validation.replace(/^Error: /, ""));

      const answers: QuestionAnswer[] = [];
      for (let i = 0; i < typed.questions.length; i += 1) {
        const question = typed.questions[i];
        if (!question) continue;

        if (question.multiSelect) {
          const labels = question.options.map((o) => o.label);
          const value = await ctx.ui.input(
            question.question,
            \`Choose one or more: \${labels.join(", ")}\`,
          );
          if (value === undefined) {
            answers.push({ questionIndex: i, question: question.question, kind: "chat", answer: "Chat about this" });
            continue;
          }
          const selected = labels.filter((label) =>
            value.toLowerCase().split(/[,\\n]/).map((part) => part.trim()).includes(label.toLowerCase()),
          );
          answers.push({
            questionIndex: i,
            question: question.question,
            kind: "multi",
            answer: null,
            selected: selected.length > 0 ? selected : [value.trim()].filter(Boolean),
          });
          continue;
        }

        const labels = question.options.map((o) => o.label);
        const picked = await ctx.ui.select(question.question, [...labels, "Type something.", "Chat about this"]);
        if (picked === undefined || picked === "Chat about this") {
          answers.push({ questionIndex: i, question: question.question, kind: "chat", answer: "Chat about this" });
          continue;
        }
        if (picked === "Type something.") {
          const custom = await ctx.ui.input(question.question, "Type your idea");
          answers.push({
            questionIndex: i,
            question: question.question,
            kind: "custom",
            answer: custom?.trim() || null,
          });
          continue;
        }
        const option = question.options.find((o) => o.label === picked);
        answers.push({
          questionIndex: i,
          question: question.question,
          kind: "option",
          answer: picked,
          preview: option?.preview,
        });
      }

      return result(formatAnswers(answers), answers, false);
    },
  });
}

function validate(params: QuestionParams): string | null {
  if (!params || !Array.isArray(params.questions) || params.questions.length === 0) {
    return "Error: At least one question is required";
  }
  if (params.questions.length > 4) return "Error: At most 4 questions are allowed";
  const seenQuestions = new Set<string>();
  for (const question of params.questions) {
    if (seenQuestions.has(question.question)) return "Error: Question text must be unique";
    seenQuestions.add(question.question);
    if (!Array.isArray(question.options) || question.options.length < 2) {
      return "Error: Each question requires at least 2 options";
    }
    if (question.options.length > 4) return "Error: Each question can have at most 4 options";
    const seenLabels = new Set<string>();
    for (const option of question.options) {
      if (RESERVED.has(option.label)) return "Error: Option label is reserved";
      if (seenLabels.has(option.label)) return "Error: Option labels must be unique";
      seenLabels.add(option.label);
    }
  }
  return null;
}

function result(text: string, answers: QuestionAnswer[], cancelled: boolean, error?: string) {
  return {
    content: [{ type: "text", text }],
    details: { answers, cancelled, error },
  };
}

function formatAnswers(answers: QuestionAnswer[]): string {
  if (answers.length === 0) return "No answers were provided.";
  return answers
    .map((answer) => {
      if (answer.kind === "multi") {
        return \`Question \${answer.questionIndex + 1}: \${answer.selected?.join(", ") || "No choices"}\`;
      }
      return \`Question \${answer.questionIndex + 1}: \${answer.answer ?? "No answer"}\`;
    })
    .join("\\n");
}
`;
}
