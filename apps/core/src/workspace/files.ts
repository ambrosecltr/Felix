import type { LearningLevel } from "@felix/contracts";

import { felixAgentsFile } from "../prompts/agentsFile.ts";
import { felixDesignDoc, felixProductDoc } from "./docs.ts";
import { felixAskUserQuestionExtension, felixSetAppMetadataExtension } from "./extensions.ts";
import { felixSkillPackageFiles } from "./skillPackages.ts";
import {
  felixAssetsSkill,
  felixBuildQualitySkill,
  felixDesignStyleSkill,
  felixRobustnessSkill,
  felixSafetySkill,
} from "./skills.ts";

export interface FelixWorkspaceFile {
  path: string;
  content: string;
  overwrite?: boolean;
}

export function felixWorkspaceFiles(
  appName: string,
  level: LearningLevel = "beginner",
): FelixWorkspaceFile[] {
  return [
    { path: "AGENTS.md", content: felixAgentsFile(appName, level), overwrite: true },
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
- \`.felix/about.json\` for the app name, emoji, and app_description.

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

## Scope

When a kid asks for something huge ("a game like Minecraft"), build a delightful small slice that actually works, and tell them kindly what it does so far. Never over-promise or wait for perfect details - ship something fun, then make it bigger.

## Accessibility

These run on a Mac, so design for a desktop window with mouse and keyboard. Keep strong contrast, make important controls reachable by keyboard, give buttons visible focus states, and respect reduced motion.

## Code Sense

Use plain JavaScript. Prefer simple named functions over clever abstractions. Keep state in a few clear variables. Use event listeners for actions.

## Talking To The Kid

Say what changed in one short, cheerful sentence. How much you explain depends on the learning level in AGENTS.md: at beginner stay in plain words, at intermediate add a tiny fun fact, at advanced you may name real terms and show a small snippet. Never lecture.
`,
    },
    {
      path: ".pi/skills/felix-safety/SKILL.md",
      overwrite: true,
      content: felixSafetySkill(),
    },
    {
      path: ".pi/skills/felix-build-quality/SKILL.md",
      overwrite: true,
      content: felixBuildQualitySkill(),
    },
    {
      path: ".pi/skills/felix-robustness/SKILL.md",
      overwrite: true,
      content: felixRobustnessSkill(),
    },
    {
      path: ".pi/skills/felix-assets/SKILL.md",
      overwrite: true,
      content: felixAssetsSkill(),
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
    {
      path: ".pi/extensions/felix-set-app-metadata/index.ts",
      overwrite: true,
      content: felixSetAppMetadataExtension(),
    },
    ...felixSkillPackageFiles(),
  ];
}
