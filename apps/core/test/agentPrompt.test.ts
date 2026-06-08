import { describe, expect, test } from "bun:test";
import { felixAgentsFile, felixSystemPrompt, felixWorkspaceFiles } from "../src/agentPrompt.ts";

const NEW_SKILLS = [
  ".pi/skills/felix-safety/SKILL.md",
  ".pi/skills/felix-build-quality/SKILL.md",
  ".pi/skills/felix-robustness/SKILL.md",
  ".pi/skills/felix-assets/SKILL.md",
  ".pi/skills/felix-browser-preview/SKILL.md",
  ".pi/skills/felix-game-engine/SKILL.md",
  ".pi/skills/felix-game-quality/SKILL.md",
  ".pi/skills/felix-frontend-design/SKILL.md",
];

const FULL_SKILL_PACKAGE_FILES = [
  ".pi/skills/felix-game-engine/references/3d-web-games.md",
  ".pi/skills/felix-game-engine/references/web-apis.md",
  ".pi/skills/felix-game-quality/assets/game-small.svg",
];

const UNSUPPORTED_SKILL_CONTENT = [
  "Playwright",
  "playwright",
  "Phaser",
  "phaser",
  "Haxe",
  "HashLink",
  "haxelib",
  "GameBase",
  "gameBase",
  "CDN",
  "npm install",
  "npx ",
  "git clone",
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

  test("bundles full text skill packages, not just skill markdown", () => {
    const paths = felixWorkspaceFiles("App", "advanced").map((file) => file.path);
    for (const file of FULL_SKILL_PACKAGE_FILES) {
      expect(paths).toContain(file);
    }
  });

  test("game guidance preserves broad browser-native rendering choices", () => {
    const gameSkill = felixWorkspaceFiles("App", "advanced").find(
      (file) => file.path === ".pi/skills/felix-game-engine/SKILL.md",
    );
    expect(gameSkill?.content).toContain("DOM/SVG/Canvas/WebGL/CSS-3D/hybrid");
    expect(gameSkill?.content).toContain("Do not default to a reduced 2D canvas version");
  });

  test("skill packages omit unsupported frameworks and setup tools", () => {
    const files = felixWorkspaceFiles("App", "advanced");
    const paths = files.map((file) => file.path);
    const combined = files.map((file) => file.content).join("\n");

    expect(paths).not.toContain(".pi/skills/felix-game-quality/scripts/web_game_playwright_client.js");
    expect(paths).not.toContain(".pi/skills/felix-game-quality/references/action_payloads.json");
    expect(paths).not.toContain(".pi/skills/felix-game-engine/assets/2d-platform-game.md");
    expect(paths).not.toContain(".pi/skills/felix-game-engine/assets/2d-maze-game.md");
    expect(paths).not.toContain(".pi/skills/felix-game-engine/assets/gameBase-template-repo.md");

    for (const unsupported of UNSUPPORTED_SKILL_CONTENT) {
      expect(combined).not.toContain(unsupported);
    }
  });
});
