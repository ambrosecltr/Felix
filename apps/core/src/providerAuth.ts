import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  PROVIDER_CATALOG_BY_ID,
  type ProviderId,
  type ProviderOAuthStatus,
} from "@felix/contracts";
import {
  type AuthInteraction,
  type AuthPrompt,
  type OAuthAuth,
  type OAuthCredential,
} from "@earendil-works/pi-ai";
import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import lockfile from "proper-lockfile";

type JsonRecord = Record<string, unknown>;

export interface ProviderApiKeyCredential {
  type: "api_key";
  key: string;
}

type StoredOAuthCredential = OAuthCredential;

interface PendingLogin {
  controller: AbortController;
  cancel(error: Error): void;
  complete(): void;
  manualCodeInput(): Promise<string>;
}

interface ProviderAuthManagerOptions {
  loginTimeoutMs?: number;
  oauthProviders?: Partial<Record<ProviderId, OAuthAuth>>;
}

export interface ProviderOAuthLoginOptions {
  openExternal(url: string): Promise<void>;
}

const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60_000;
const TOKEN_REFRESH_LEEWAY_MS = 60_000;
const OAUTH_AUTHORIZATION_ORIGIN = "https://auth.openai.com";
const OPENAI_CODEX_BROWSER_LOGIN_METHOD = "browser";

registerBunOAuthFlows();

const DEFAULT_OAUTH_PROVIDERS: Partial<Record<ProviderId, OAuthAuth>> = {
  "openai-codex": openaiCodexProvider().auth.oauth,
};

export class ProviderAuthManager {
  private readonly authFile: string;
  private readonly loginTimeoutMs: number;
  private readonly oauthProviders: Partial<Record<ProviderId, OAuthAuth>>;
  private readonly pendingLogins = new Map<ProviderId, PendingLogin>();

  constructor(
    agentDir: string,
    options: ProviderAuthManagerOptions = {},
  ) {
    this.authFile = path.join(agentDir, "auth.json");
    this.loginTimeoutMs = options.loginTimeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS;
    this.oauthProviders = options.oauthProviders ?? DEFAULT_OAUTH_PROVIDERS;
  }

  async status(providerId: ProviderId): Promise<ProviderOAuthStatus> {
    const authorized = await withAuthFile(this.authFile, async (auth) =>
      isStoredOAuthCredential(auth[providerId]),
    );
    return { providerId, authorized };
  }

  async login(
    providerId: ProviderId,
    options: ProviderOAuthLoginOptions,
  ): Promise<ProviderOAuthStatus> {
    const provider = this.requireOAuthProvider(providerId);
    if (this.pendingLogins.has(providerId)) {
      throw new Error(`${PROVIDER_CATALOG_BY_ID[providerId].label} authorization is already open.`);
    }

    const pending = createPendingLogin();
    this.pendingLogins.set(providerId, pending);
    const timeout = setTimeout(() => {
      pending.cancel(new Error(`${PROVIDER_CATALOG_BY_ID[providerId].label} authorization timed out.`));
    }, this.loginTimeoutMs);

    try {
      const credentials = await provider.login(
        loginInteraction(providerId, pending, options.openExternal),
      );
      await updateAuthFile(this.authFile, (auth) => ({
        ...auth,
        [providerId]: credentials,
      }));
      return { providerId, authorized: true };
    } finally {
      clearTimeout(timeout);
      pending.complete();
      this.pendingLogins.delete(providerId);
    }
  }

  cancel(providerId: ProviderId): void {
    this.pendingLogins.get(providerId)?.cancel(new Error("Authorization cancelled."));
  }

  async logout(providerId: ProviderId): Promise<ProviderOAuthStatus> {
    this.cancel(providerId);
    this.requireOAuthProvider(providerId);
    await updateAuthFile(this.authFile, (auth) => {
      const next = { ...auth };
      delete next[providerId];
      return next;
    });
    return { providerId, authorized: false };
  }

  async ensureAuthorized(providerId: ProviderId): Promise<boolean> {
    const provider = this.requireOAuthProvider(providerId);
    return withAuthFile(this.authFile, async (auth, save) => {
      const credential = auth[providerId];
      if (!isStoredOAuthCredential(credential)) return false;
      if (credential.expires > Date.now() + TOKEN_REFRESH_LEEWAY_MS) return true;

      try {
        const refreshed = await provider.refresh(credential);
        await save({
          ...auth,
          [providerId]: refreshed,
        });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `${PROVIDER_CATALOG_BY_ID[providerId].label} authorization expired. Re-authorize and try again. ${message}`,
        );
      }
    });
  }

  shutdown(): void {
    for (const pending of this.pendingLogins.values()) {
      pending.cancel(new Error("Authorization cancelled because Felix is closing."));
    }
  }

  private requireOAuthProvider(providerId: ProviderId): OAuthAuth {
    const catalogProvider = PROVIDER_CATALOG_BY_ID[providerId];
    const oauthProvider = this.oauthProviders[providerId];
    if (catalogProvider.auth.type !== "oauth" || !oauthProvider) {
      throw new Error(`${catalogProvider.label} does not support OAuth authorization.`);
    }
    return oauthProvider;
  }
}

export async function writeProviderApiKeyCredentials(
  authFile: string,
  credentials: Partial<Record<ProviderId, ProviderApiKeyCredential>>,
): Promise<void> {
  await updateAuthFile(authFile, (auth) => {
    const oauthCredentials = Object.fromEntries(
      Object.entries(auth).filter((entry) => isStoredOAuthCredential(entry[1])),
    );
    return { ...oauthCredentials, ...credentials };
  });
}

function loginInteraction(
  providerId: ProviderId,
  pending: PendingLogin,
  openExternal: ProviderOAuthLoginOptions["openExternal"],
): AuthInteraction {
  return {
    signal: pending.controller.signal,
    prompt: async (prompt) => answerLoginPrompt(providerId, pending, prompt),
    notify: (event) => {
      if (event.type === "device_code") {
        pending.cancel(new Error("ChatGPT device authorization is not available in Felix."));
        return;
      }
      if (event.type !== "auth_url") return;

      let authorizationUrl: URL;
      try {
        authorizationUrl = new URL(event.url);
      } catch {
        pending.cancel(new Error("The ChatGPT authorization URL was invalid."));
        return;
      }
      if (authorizationUrl.origin !== OAUTH_AUTHORIZATION_ORIGIN) {
        pending.cancel(new Error("Felix refused an unexpected authorization URL."));
        return;
      }
      void openExternal(authorizationUrl.toString()).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        pending.cancel(new Error(`Felix could not open ChatGPT authorization. ${message}`));
      });
    },
  };
}

async function answerLoginPrompt(
  providerId: ProviderId,
  pending: PendingLogin,
  prompt: AuthPrompt,
): Promise<string> {
  if (prompt.type === "select") {
    if (prompt.options.some((option) => option.id === OPENAI_CODEX_BROWSER_LOGIN_METHOD)) {
      return OPENAI_CODEX_BROWSER_LOGIN_METHOD;
    }
  } else if (prompt.type === "manual_code") {
    return Promise.race([
      pending.manualCodeInput(),
      rejectWhenAborted(prompt.signal),
    ]);
  }

  throw new Error(
    `${PROVIDER_CATALOG_BY_ID[providerId].label} requested an unsupported authorization step.`,
  );
}

function rejectWhenAborted(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(new Error("Authorization callback received."));
      return;
    }
    signal.addEventListener(
      "abort",
      () => reject(new Error("Authorization callback received.")),
      { once: true },
    );
  });
}

function createPendingLogin(): PendingLogin {
  const controller = new AbortController();
  let resolveManual: ((value: string) => void) | null = null;
  let rejectManual: ((reason: Error) => void) | null = null;
  let queuedError: Error | null = null;

  return {
    controller,
    cancel(error) {
      controller.abort();
      if (rejectManual) {
        rejectManual(error);
      } else {
        queuedError = error;
      }
    },
    complete() {
      resolveManual?.("");
    },
    manualCodeInput() {
      if (queuedError) return Promise.reject(queuedError);
      return new Promise<string>((resolve, reject) => {
        resolveManual = resolve;
        rejectManual = reject;
      });
    },
  };
}

async function updateAuthFile(
  authFile: string,
  update: (auth: JsonRecord) => JsonRecord,
): Promise<void> {
  await withAuthFile(authFile, async (auth, save) => {
    await save(update(auth));
  });
}

async function withAuthFile<T>(
  authFile: string,
  action: (auth: JsonRecord, save: (next: JsonRecord) => Promise<void>) => Promise<T>,
): Promise<T> {
  await ensureAuthFile(authFile);
  const release = await lockfile.lock(authFile, {
    realpath: false,
    retries: {
      retries: 10,
      factor: 2,
      minTimeout: 50,
      maxTimeout: 1_000,
      randomize: true,
    },
    stale: 30_000,
  });

  try {
    const auth = parseAuthFile(await fs.readFile(authFile, "utf8"), authFile);
    return await action(auth, async (next) => {
      await fs.writeFile(authFile, JSON.stringify(next, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      });
      await fs.chmod(authFile, 0o600);
    });
  } finally {
    await release();
  }
}

async function ensureAuthFile(authFile: string): Promise<void> {
  const authDir = path.dirname(authFile);
  await fs.mkdir(authDir, { recursive: true, mode: 0o700 });
  await fs.chmod(authDir, 0o700);
  try {
    await fs.writeFile(authFile, "{}", { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
  }
  await fs.chmod(authFile, 0o600);
}

function parseAuthFile(raw: string, authFile: string): JsonRecord {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Throw a path-aware error below.
  }
  throw new Error(`Provider auth file is malformed: ${authFile}`);
}

function isStoredOAuthCredential(value: unknown): value is StoredOAuthCredential {
  return (
    isRecord(value) &&
    value.type === "oauth" &&
    typeof value.access === "string" &&
    value.access.length > 0 &&
    typeof value.refresh === "string" &&
    value.refresh.length > 0 &&
    typeof value.expires === "number" &&
    Number.isFinite(value.expires)
  );
}

function isAlreadyExistsError(error: unknown): boolean {
  return isRecord(error) && error.code === "EEXIST";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
