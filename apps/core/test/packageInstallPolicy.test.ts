import { describe, expect, test } from "bun:test";
import {
  MINI_APP_MINIMUM_RELEASE_AGE_SECONDS,
  miniAppBunInstallArgs,
  miniAppBunWrapperDir,
  miniAppBunWrapperScript,
  miniAppBunfig,
} from "../src/packageInstallPolicy.ts";

describe("package install policy", () => {
  test("uses a 3 day minimum release age for mini app package resolution", () => {
    expect(MINI_APP_MINIMUM_RELEASE_AGE_SECONDS).toBe(259200);
    expect(miniAppBunfig()).toBe(`[install]
minimumReleaseAge = 259200
`);
    expect(miniAppBunInstallArgs()).toEqual(["install", "--minimum-release-age=259200"]);
  });

  test("places the agent bun wrapper inside the Felix app metadata directory", () => {
    expect(miniAppBunWrapperDir("/apps/snake")).toBe("/apps/snake/.felix/bin");
  });

  test("adds the minimum release age only to bun package resolution commands", () => {
    const script = miniAppBunWrapperScript('/Applications/Felix.app/Contents/Resources/bun/bin/bun');

    expect(script).toContain("install|add|update");
    expect(script).toContain("--minimum-release-age=259200");
    expect(script).toContain('exec "/Applications/Felix.app/Contents/Resources/bun/bin/bun" "$@"');
  });
});
