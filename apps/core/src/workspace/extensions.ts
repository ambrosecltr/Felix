export function felixSetAppMetadataExtension(): string {
  return `import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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
} as any;

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

export function felixAskUserQuestionExtension(): string {
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
