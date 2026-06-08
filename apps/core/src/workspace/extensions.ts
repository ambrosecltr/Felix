export function felixSetAppMetadataExtension(): string {
  return `import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";

type ToolParameters = ToolDefinition["parameters"];
type MetadataParams = {
  name?: string;
  emoji?: string;
  app_description?: string;
};

const parameters = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Short kid-friendly app name, usually 1-3 words.",
      maxLength: 40,
    },
    emoji: {
      type: "string",
      description: "One emoji that works as the fallback dashboard icon.",
      maxLength: 16,
    },
    app_description: {
      type: "string",
      description:
        "Plain description of the app's concept for Felix dashboard icon generation. Update this when the app's core idea changes.",
      maxLength: 600,
    },
  },
} as ToolParameters;

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "set_app_metadata",
    label: "Name App",
    description:
      "Set the Felix mini app name, fallback emoji, and app_description metadata. app_description is used by Felix to generate a dashboard app icon when adults have enabled icon generation.",
    promptSnippet:
      "Use set_app_metadata early for every new app, and update app_description whenever the app's core idea changes.",
    promptGuidelines: [
      "Use this instead of manually editing .felix/about.json when you are choosing or changing the app name, fallback emoji, or description.",
      "Keep name short and kid-friendly.",
      "Use exactly one emoji for emoji.",
      "Write app_description as a compact plain-English description of what the app does, not a visual style prompt.",
    ],
    parameters,
    async execute(_toolCallId, params) {
      const typed = params as MetadataParams;
      const patch = normalizePatch(typed);
      if (Object.keys(patch).length === 0) {
        return result("Error: Provide at least one of name, emoji, or app_description.", true);
      }

      const filePath = path.join(process.cwd(), ".felix", "about.json");
      const current = await readCurrentMetadata(filePath);
      const next = { ...current, ...patch };
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(next, null, 2) + "\\n", "utf8");

      const saved = [
        typeof next.name === "string" ? \`name "\${next.name}"\` : null,
        typeof next.emoji === "string" ? \`emoji \${next.emoji}\` : null,
        typeof next.app_description === "string" ? "app_description" : null,
      ].filter(Boolean);
      return result(\`Saved app metadata: \${saved.join(", ")}.\`, false);
    },
  });
}

async function readCurrentMetadata(filePath: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizePatch(params: MetadataParams): Record<string, string> {
  const patch: Record<string, string> = {};
  if (typeof params.name === "string") {
    const name = params.name.trim().slice(0, 40);
    if (name.length > 0) patch.name = name;
  }
  if (typeof params.emoji === "string") {
    const emoji = firstGrapheme(params.emoji.trim());
    if (emoji.length > 0) patch.emoji = emoji;
  }
  if (typeof params.app_description === "string") {
    const appDescription = params.app_description.trim().replace(/\\s+/g, " ").slice(0, 600);
    if (appDescription.length > 0) patch.app_description = appDescription;
  }
  return patch;
}

function firstGrapheme(input: string): string {
  const Segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    const segmenter = new Segmenter();
    for (const { segment } of segmenter.segment(input)) return segment;
  }
  return [...input][0] ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function result(text: string, isError: boolean) {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}
`;
}

export function felixBrowserPreviewExtension(): string {
  return `import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";

type BrowserToolName =
  | "browser_snapshot"
  | "browser_screenshot"
  | "browser_logs"
  | "browser_reload"
  | "browser_click"
  | "browser_type"
  | "browser_key"
  | "browser_scroll"
  | "browser_move_cursor"
  | "browser_game";

type ToolParameters = ToolDefinition["parameters"];

const BRIDGE_TIMEOUT_MS = 30_000;
const POLL_MS = 50;

const emptyParameters = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as ToolParameters;

const clickParameters = {
  type: "object",
  properties: {
    x: { type: "number", description: "Horizontal viewport coordinate in browser pixels." },
    y: { type: "number", description: "Vertical viewport coordinate in browser pixels." },
    button: { type: "string", enum: ["left", "middle", "right"], default: "left" },
    clickCount: { type: "number", minimum: 1, maximum: 3, default: 1 },
  },
  required: ["x", "y"],
  additionalProperties: false,
} as ToolParameters;

const typeParameters = {
  type: "object",
  properties: {
    text: { type: "string", minLength: 1, maxLength: 5000 },
  },
  required: ["text"],
  additionalProperties: false,
} as ToolParameters;

const keyParameters = {
  type: "object",
  properties: {
    key: {
      type: "string",
      minLength: 1,
      maxLength: 40,
      description: "Electron key code such as Enter, Escape, Space, Tab, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Backspace, or a single letter.",
    },
  },
  required: ["key"],
  additionalProperties: false,
} as ToolParameters;

const scrollParameters = {
  type: "object",
  properties: {
    deltaX: { type: "number", default: 0 },
    deltaY: { type: "number", default: 0 },
    x: { type: "number", description: "Optional horizontal viewport coordinate to move to before scrolling." },
    y: { type: "number", description: "Optional vertical viewport coordinate to move to before scrolling." },
  },
  additionalProperties: false,
} as ToolParameters;

const moveCursorParameters = {
  type: "object",
  properties: {
    x: { type: "number", description: "Horizontal viewport coordinate in browser pixels." },
    y: { type: "number", description: "Vertical viewport coordinate in browser pixels." },
  },
  required: ["x", "y"],
  additionalProperties: false,
} as ToolParameters;

const logsParameters = {
  type: "object",
  properties: {
    level: {
      type: "string",
      enum: ["all", "warnings-and-errors", "errors"],
      default: "warnings-and-errors",
    },
    limit: { type: "number", minimum: 1, maximum: 100, default: 30 },
  },
  additionalProperties: false,
} as ToolParameters;

const gameParameters = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["pause", "resume", "step", "state"],
      default: "state",
      description:
        "pause/resume freeze or unfreeze the game loop, step advances the game by a fixed number of frames while paused, state just reads window.render_game_to_text().",
    },
    frames: {
      type: "number",
      minimum: 1,
      maximum: 600,
      default: 1,
      description: "Number of frames to advance when action is step.",
    },
  },
  additionalProperties: false,
} as ToolParameters;

export default function (pi: ExtensionAPI) {
  registerBrowserTool(pi, {
    name: "browser_snapshot",
    label: "Inspect Preview",
    description:
      "Read Felix's live preview: current URL, title, viewport, visible text, interactive controls, optional game state hook, and recent page errors.",
    parameters: emptyParameters,
  });
  registerBrowserTool(pi, {
    name: "browser_screenshot",
    label: "View Preview",
    description:
      "Capture a screenshot of Felix's live preview so you can inspect layout, readability, canvas/SVG/WebGL output, and visual state.",
    parameters: emptyParameters,
  });
  registerBrowserTool(pi, {
    name: "browser_logs",
    label: "Check Preview Logs",
    description: "Read recent console messages and page load errors from Felix's live preview.",
    parameters: logsParameters,
  });
  registerBrowserTool(pi, {
    name: "browser_reload",
    label: "Reload Preview",
    description: "Reload Felix's live preview, then wait briefly for the page to finish loading.",
    parameters: emptyParameters,
  });
  registerBrowserTool(pi, {
    name: "browser_click",
    label: "Click Preview",
    description:
      "Move Felix's visible cursor to a viewport coordinate and click the live preview.",
    parameters: clickParameters,
  });
  registerBrowserTool(pi, {
    name: "browser_type",
    label: "Type In Preview",
    description: "Type text into the currently focused control in Felix's live preview.",
    parameters: typeParameters,
  });
  registerBrowserTool(pi, {
    name: "browser_key",
    label: "Press Key",
    description: "Send a keyboard key to Felix's live preview.",
    parameters: keyParameters,
  });
  registerBrowserTool(pi, {
    name: "browser_scroll",
    label: "Scroll Preview",
    description: "Move Felix's visible cursor if coordinates are provided, then scroll the live preview.",
    parameters: scrollParameters,
  });
  registerBrowserTool(pi, {
    name: "browser_move_cursor",
    label: "Move Cursor",
    description:
      "Move Felix's visible cursor to a viewport coordinate without clicking. Use this sparingly for hover checks.",
    parameters: moveCursorParameters,
  });
  registerBrowserTool(pi, {
    name: "browser_game",
    label: "Control Game",
    description:
      "Verify fast or animated games without racing the game clock. Pause or resume the game loop, step it a fixed number of frames while paused, or read window.render_game_to_text() state. Use this instead of live screenshots when a game moves too fast to smoke-test by hand. Requires the game to expose window.felixGame.pause()/resume()/step() and window.render_game_to_text().",
    parameters: gameParameters,
  });
}

function registerBrowserTool(
  pi: ExtensionAPI,
  definition: {
    name: BrowserToolName;
    label: string;
    description: string;
    parameters: ToolParameters;
  },
): void {
  pi.registerTool({
    name: definition.name,
    label: definition.label,
    description: definition.description,
    promptSnippet:
      "Use Felix browser preview tools to verify the running app before saying a change is done.",
    promptGuidelines: [
      "Use browser_snapshot for visible text, controls, current URL, optional game state hooks, and recent errors.",
      "Use browser_screenshot when layout, canvas/SVG/WebGL output, readability, or visual state matters.",
      "Use browser_logs after code changes and fix new warnings or errors before answering.",
      "Use browser_click, browser_type, browser_key, and browser_scroll to run the same path the child will use.",
      "For fast or animated games, do not race the clock with live screenshots: use browser_game to pause, read render_game_to_text() state, step a few frames, and read again. Add window.felixGame.pause()/resume()/step() and window.render_game_to_text() to the game first if they are missing.",
      "Tool coordinates are viewport coordinates. browser_screenshot tells you how to map screenshot points to viewport coordinates when scaling is involved.",
    ],
    parameters: definition.parameters,
    async execute(_toolCallId, params, signal) {
      try {
        return await sendBrowserRequest(definition.name, params, signal);
      } catch (err) {
        return textResult("Error: " + errorMessage(err), true);
      }
    },
  });
}

async function sendBrowserRequest(
  toolName: BrowserToolName,
  params: unknown,
  signal?: AbortSignal,
) {
  const bridgeDir = process.env.FELIX_BROWSER_BRIDGE_DIR;
  if (!bridgeDir) {
    return textResult("Error: Felix preview browser is not available.", true);
  }

  const id = crypto.randomUUID();
  const requestPath = path.join(bridgeDir, id + ".request.json");
  const responsePath = path.join(bridgeDir, id + ".response.json");
  const tempPath = requestPath + "." + process.pid + ".tmp";
  const request = {
    id,
    toolName,
    params: isRecord(params) ? params : {},
  };

  try {
    await fs.writeFile(tempPath, JSON.stringify(request), "utf8");
    await fs.rename(tempPath, requestPath);

    const deadline = Date.now() + BRIDGE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error("Browser preview tool was cancelled.");
      try {
        const response = parseBridgeResponse(await fs.readFile(responsePath, "utf8"), id);
        if (response.error) return textResult("Error: " + response.error, true);
        return normalizeToolResult(response.result);
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
      await sleep(POLL_MS);
    }

    throw new Error("Felix preview browser did not respond in time.");
  } finally {
    await Promise.all([
      fs.rm(tempPath, { force: true }).catch(() => {}),
      fs.rm(requestPath, { force: true }).catch(() => {}),
      fs.rm(responsePath, { force: true }).catch(() => {}),
    ]);
  }
}

function parseBridgeResponse(raw: string, expectedId: string): { id: string; result?: unknown; error?: string } {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || parsed.id !== expectedId) {
    throw new Error("Invalid browser preview response");
  }
  return {
    id: parsed.id,
    result: parsed.result,
    error: typeof parsed.error === "string" ? parsed.error : undefined,
  };
}

function normalizeToolResult(result: unknown) {
  if (!isRecord(result) || !Array.isArray(result.content)) {
    return textResult("Error: Felix preview browser returned an invalid result.", true);
  }
  const content = result.content.filter(isContent);
  if (content.length === 0) {
    return textResult("Error: Felix preview browser returned no readable content.", true);
  }
  return {
    content,
    details: result.details,
    isError: result.isError === true,
  };
}

function isContent(value: unknown): value is { type: "text"; text: string } | { type: "image"; data: string; mimeType: string } {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "text") return typeof value.text === "string";
  return value.type === "image" && typeof value.data === "string" && typeof value.mimeType === "string";
}

function textResult(text: string, isError: boolean) {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNotFound(err: unknown): boolean {
  return errorCode(err) === "ENOENT";
}

function errorCode(err: unknown): string | undefined {
  return isRecord(err) && typeof err.code === "string" ? err.code : undefined;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
`;
}

export function felixAskUserQuestionExtension(): string {
  return `import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";

type ToolParameters = ToolDefinition["parameters"];
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
} as ToolParameters;

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
