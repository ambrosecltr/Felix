import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { miniAppPaths } from "../src/paths.ts";

describe("mini app paths", () => {
  test("keeps mini app roots inside the apps directory", () => {
    const appsDir = path.join(path.sep, "tmp", "felix-apps");

    expect(miniAppPaths(appsDir, "paint-pad").root).toBe(path.join(appsDir, "paint-pad"));
    expect(() => miniAppPaths(appsDir, "../outside")).toThrow("Invalid mini app id");
    expect(() => miniAppPaths(appsDir, "paint-pad/.felix")).toThrow("Invalid mini app id");
    expect(() => miniAppPaths(appsDir, "")).toThrow("Invalid mini app id");
  });
});
