import { describe, expect, test } from "bun:test";
import { felixAgentsFile, felixSystemPrompt, felixWorkspaceFiles } from "../src/agentPrompt.ts";

const NEW_SKILLS = [
  ".pi/skills/felix-safety/SKILL.md",
  ".pi/skills/felix-build-quality/SKILL.md",
  ".pi/skills/felix-robustness/SKILL.md",
  ".pi/skills/felix-assets/SKILL.md",
];

describe("felix system prompt safety", () => {
  for (const level of ["beginner", "intermediate", "advanced"] as const) {
    test(`safety rules are always present at the ${level} level`, () => {
      const prompt = felixSystemPrompt(level);
      expect(prompt).toContain("AI");
      expect(prompt).toContain("personal info");
      expect(prompt).toContain("age-appropriate");
      expect(prompt).toContain("trusted grown-up");
    });
  }

  test("system prompt summarizes the active teaching level", () => {
    expect(felixSystemPrompt("beginner")).toContain("beginner");
    expect(felixSystemPrompt("intermediate")).toContain("intermediate");
    expect(felixSystemPrompt("advanced")).toContain("advanced");
  });
});

describe("felix teaching ladder", () => {
  test("beginner does not invite code snippets", () => {
    const agents = felixAgentsFile("Star Catcher", "beginner");
    expect(agents).toContain("BEGINNER");
    expect(agents).not.toContain("code snippet");
  });

  test("intermediate adds a fun fact but no code", () => {
    const agents = felixAgentsFile("Star Catcher", "intermediate");
    expect(agents).toContain("INTERMEDIATE");
    expect(agents).toContain("fun fact");
    expect(agents).not.toContain("code snippet");
  });

  test("advanced enables small code snippets", () => {
    const agents = felixAgentsFile("Star Catcher", "advanced");
    expect(agents).toContain("ADVANCED");
    expect(agents).toContain("code snippet");
  });

  test("agents file always carries the safety section", () => {
    for (const level of ["beginner", "intermediate", "advanced"] as const) {
      expect(felixAgentsFile("App", level)).toContain("Keeping kids safe");
    }
  });
});

describe("felix workspace skills", () => {
  for (const level of ["beginner", "intermediate", "advanced"] as const) {
    test(`bundles the new dev-standard skills at the ${level} level`, () => {
      const paths = felixWorkspaceFiles("App", level).map((file) => file.path);
      for (const skill of NEW_SKILLS) {
        expect(paths).toContain(skill);
      }
    });
  }

  test("does not reference phone or mobile layouts", () => {
    const combined = felixWorkspaceFiles("App", "advanced")
      .map((file) => file.content)
      .join("\n")
      .toLowerCase();
    expect(combined).not.toContain("phone width");
    expect(combined).not.toContain("phone layout");
    expect(combined).not.toContain("responsive from phone");
  });
});
