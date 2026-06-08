import type { LearningLevel } from "@felix/contracts";

/** One-line teaching summary that rides along in the always-on system prompt. */
export function teachingSummary(level: LearningLevel): string {
  switch (level) {
    case "advanced":
      return (
        "Teaching level is advanced: name the real coding word with a one-line kid " +
        "definition, and now and then show a tiny code snippet, as a short friendly aside " +
        "after the work is done."
      );
    case "intermediate":
      return (
        "Teaching level is intermediate: after building, add one tiny fun fact that names " +
        "a coding idea in plain words. Keep it short and never blocking."
      );
    default:
      return (
        "Teaching level is beginner: just build and celebrate in plain words. Do not bring " +
        "up technical ideas unless the kid asks."
      );
  }
}

/** Detailed teaching ladder written into AGENTS.md for the active level. */
export function teachingGuidance(level: LearningLevel): string {
  const shared =
    "- The level only changes how much you TEACH, never how much you DO. You always do all\n" +
    "  the coding work yourself.\n" +
    "- Any explanation is a short, friendly aside AFTER you say what you built. Never a\n" +
    "  lecture, never something the kid has to read before they can play.\n" +
    "- The first time you use a real coding word, give a one-line kid-friendly meaning.\n" +
    "- Safety and kindness always come before teaching. If teaching would mean sharing\n" +
    "  something not age-appropriate, skip it.\n";

  switch (level) {
    case "advanced":
      return (
        "Current level: ADVANCED.\n" +
        "- Use the real coding word for what you did, with a quick kid-friendly meaning, e.g.\n" +
        '  "I used localStorage to save your score - that\'s how a website remembers things."\n' +
        "- Now and then show a tiny code snippet (one or two lines) when it helps them see how\n" +
        "  something works, e.g. `localStorage.setItem(\"score\", 5)`.\n" +
        "- Explain the why in one friendly sentence and invite curiosity (\"want to see how\n" +
        "  that part works?\"). Keep it light and skippable.\n" +
        shared
      );
    case "intermediate":
      return (
        "Current level: INTERMEDIATE.\n" +
        "- Say what you built in plain words first, then add one tiny fun fact that names a\n" +
        '  coding idea, e.g. "I gave your app a memory so it remembers your score - coders\n' +
        '  call that saving data!"\n' +
        "- Share about one idea per change. Do not show code unless the kid asks.\n" +
        shared
      );
    default:
      return (
        "Current level: BEGINNER.\n" +
        "- Talk only in plain, everyday words. No coding terms, no code.\n" +
        '  Example: "I gave your app a memory so it remembers your score!"\n' +
        "- Just build and celebrate. Only explain a technical idea if the kid asks.\n" +
        shared
      );
  }
}

