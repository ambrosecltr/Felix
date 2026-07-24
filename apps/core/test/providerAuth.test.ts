import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { AuthPrompt, OAuthAuth, OAuthCredential } from "@earendil-works/pi-ai";
import { ProviderAuthManager } from "../src/providerAuth.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("provider OAuth", () => {
  test("opens ChatGPT authorization and stores private PI credentials", async () => {
    const authFile = await useTempAuthFile();
    const openedUrls: string[] = [];
    const credentials = oauthCredentials();
    const manager = managerWith(authFile, {
      async login(interaction) {
        expect(await interaction.prompt(loginMethodPrompt())).toBe("browser");
        interaction.notify({
          type: "auth_url",
          url: "https://auth.openai.com/oauth/authorize?state=test",
        });
        return credentials;
      },
    });

    const status = await manager.login("openai-codex", {
      openExternal: async (url) => {
        openedUrls.push(url);
      },
    });

    expect(status).toEqual({ providerId: "openai-codex", authorized: true });
    expect(openedUrls).toEqual(["https://auth.openai.com/oauth/authorize?state=test"]);
    expect(await manager.status("openai-codex")).toEqual({
      providerId: "openai-codex",
      authorized: true,
    });
    const stored = JSON.parse(await fs.readFile(authFile, "utf8")) as Record<string, unknown>;
    expect(stored["openai-codex"]).toEqual({ type: "oauth", ...credentials });
    expect((await fs.stat(authFile)).mode & 0o777).toBe(0o600);
  });

  test("cancels an in-progress browser login", async () => {
    const authFile = await useTempAuthFile();
    let waitingForCode: (() => void) | null = null;
    const ready = new Promise<void>((resolve) => {
      waitingForCode = resolve;
    });
    const manager = managerWith(authFile, {
      async login(interaction) {
        interaction.notify({
          type: "auth_url",
          url: "https://auth.openai.com/oauth/authorize",
        });
        waitingForCode?.();
        await interaction.prompt({ type: "manual_code", message: "Complete login" });
        return oauthCredentials();
      },
    });

    const login = manager.login("openai-codex", { openExternal: async () => {} });
    await ready;
    manager.cancel("openai-codex");

    await expect(login).rejects.toThrow("Authorization cancelled.");
    expect((await manager.status("openai-codex")).authorized).toBe(false);
  });

  test("refreshes expired credentials without exposing them", async () => {
    const authFile = await useTempAuthFile({
      "openai-codex": {
        type: "oauth",
        ...oauthCredentials({ expires: Date.now() - 1 }),
      },
    });
    let refreshes = 0;
    const manager = managerWith(authFile, {
      async refresh() {
        refreshes += 1;
        return oauthCredentials({ access: "refreshed-access" });
      },
    });

    expect(await manager.ensureAuthorized("openai-codex")).toBe(true);
    expect(refreshes).toBe(1);
    expect(await manager.status("openai-codex")).toEqual({
      providerId: "openai-codex",
      authorized: true,
    });
    expect(await fs.readFile(authFile, "utf8")).toContain("refreshed-access");
  });

  test("disconnects without disturbing other provider credentials", async () => {
    const authFile = await useTempAuthFile({
      "openai-codex": { type: "oauth", ...oauthCredentials() },
      openrouter: { type: "api_key", key: "sk-or-test" },
    });
    const manager = managerWith(authFile);

    expect(await manager.logout("openai-codex")).toEqual({
      providerId: "openai-codex",
      authorized: false,
    });
    const stored = JSON.parse(await fs.readFile(authFile, "utf8")) as Record<string, unknown>;
    expect(stored["openai-codex"]).toBeUndefined();
    expect(stored.openrouter).toEqual({ type: "api_key", key: "sk-or-test" });
  });

  test("repairs the agent directory mode left by the legacy auth path bug", async () => {
    const authFile = await useTempAuthFile();
    const agentDir = path.dirname(authFile);
    await fs.chmod(agentDir, 0o600);

    expect(await managerWith(authFile).status("openai-codex")).toEqual({
      providerId: "openai-codex",
      authorized: false,
    });
    expect((await fs.stat(agentDir)).mode & 0o777).toBe(0o700);
  });
});

function managerWith(
  authFile: string,
  overrides: Partial<OAuthAuth> = {},
): ProviderAuthManager {
  const provider: OAuthAuth = {
    name: "ChatGPT Subscription",
    login: async () => oauthCredentials(),
    refresh: async () => oauthCredentials(),
    toAuth: async (credentials) => ({ apiKey: credentials.access }),
    ...overrides,
  };
  return new ProviderAuthManager(path.dirname(authFile), {
    loginTimeoutMs: 1_000,
    oauthProviders: { "openai-codex": provider },
  });
}

function loginMethodPrompt(): AuthPrompt {
  return {
    type: "select",
    message: "Select login method",
    options: [{ id: "browser", label: "Browser" }],
  };
}

function oauthCredentials(overrides: Partial<OAuthCredential> = {}): OAuthCredential {
  return {
    type: "oauth",
    access: "access-token",
    refresh: "refresh-token",
    expires: Date.now() + 60 * 60_000,
    accountId: "account-id",
    ...overrides,
  };
}

async function useTempAuthFile(initial: Record<string, unknown> = {}): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-provider-auth-"));
  tempDirs.push(dir);
  const authFile = path.join(dir, "agent", "auth.json");
  await fs.mkdir(path.dirname(authFile), { recursive: true });
  await fs.writeFile(authFile, JSON.stringify(initial), { encoding: "utf8", mode: 0o600 });
  return authFile;
}
