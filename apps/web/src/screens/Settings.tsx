import { useEffect, useRef, useState } from "react";
import {
  PROVIDER_CATALOG,
  PROVIDER_CATALOG_BY_ID,
  type FelixSettings,
  type ProviderCatalogEntry,
  type ProviderConfig,
  type ProviderId,
  type ProviderModel,
  type ProviderModelsRequest,
  type ProviderModelsResponse,
} from "@felix/contracts";
import { felix } from "../bridge.ts";
import { useIcon } from "../lib/icon-context.tsx";
import { useStore } from "../store.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Card } from "../components/ui/Card.tsx";
import { InputField, InputGroup } from "../components/ui/input-group.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "../components/ui/select.tsx";
import { Switch } from "../components/ui/switch.tsx";

export function Settings() {
  const { goDashboard } = useStore();
  const [settings, setSettings] = useState<FelixSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [modelResult, setModelResult] = useState<ProviderModelsResponse | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelRefreshToken, setModelRefreshToken] = useState(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelRequestRef = useRef(0);
  const RefreshIcon = useIcon("rotate-ccw");

  const activeProviderId = settings?.activeProvider;
  const activeApiKey = settings && activeProviderId ? keyFor(settings, activeProviderId) : "";
  const activeProviderConfig =
    settings && activeProviderId ? providerConfigFor(settings, activeProviderId) : null;
  const activeOAuthAccessToken = activeProviderConfig?.oauth?.accessToken ?? "";
  const activeOAuthExpiresAt = activeProviderConfig?.oauth?.expiresAt ?? "";
  const activeOAuthError = activeProviderConfig?.oauth?.error ?? "";

  useEffect(() => {
    void felix.invoke("settings.get", undefined).then(setSettings);
  }, []);

  useEffect(() => {
    if (!activeProviderId) return;
    const provider = PROVIDER_CATALOG_BY_ID[activeProviderId];
    const authState = authStateFor(provider, {
      apiKey: activeApiKey,
      oauthAccessToken: activeOAuthAccessToken,
      oauthExpiresAt: activeOAuthExpiresAt,
      oauthError: activeOAuthError,
    });

    if (!authState.request) {
      modelRequestRef.current += 1;
      setModelResult(null);
      setLoadingModels(false);
      return;
    }

    const requestId = modelRequestRef.current + 1;
    modelRequestRef.current = requestId;
    setLoadingModels(true);

    const timeout = setTimeout(() => {
      void felix
        .invoke("provider.models", { providerId: activeProviderId, ...authState.request })
        .then((result) => {
          if (modelRequestRef.current === requestId) setModelResult(result);
        })
        .catch((error: unknown) => {
          if (modelRequestRef.current !== requestId) return;
          setModelResult({
            providerId: activeProviderId,
            models: [],
            source: "none",
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          if (modelRequestRef.current === requestId) setLoadingModels(false);
        });
    }, 350);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    activeApiKey,
    activeOAuthAccessToken,
    activeOAuthError,
    activeOAuthExpiresAt,
    activeProviderId,
    modelRefreshToken,
  ]);

  useEffect(() => {
    if (!settings || !modelResult || modelResult.providerId !== settings.activeProvider) return;
    if (modelResult.models.some((model) => model.id === settings.activeModel)) return;

    const provider = PROVIDER_CATALOG_BY_ID[settings.activeProvider];
    const nextModel =
      modelResult.models.find((model) => model.id === provider.defaultModel)?.id ??
      modelResult.models[0]?.id;
    if (!nextModel) return;

    setSettings((current) => {
      if (!current || current.activeProvider !== modelResult.providerId) return current;
      if (current.activeModel === nextModel) return current;
      return { ...current, activeModel: nextModel };
    });
  }, [modelResult, settings]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  if (!settings) return null;

  const activeProvider = PROVIDER_CATALOG_BY_ID[settings.activeProvider];
  const activeAuthState = authStateFor(activeProvider, {
    apiKey: activeApiKey,
    oauthAccessToken: activeOAuthAccessToken,
    oauthExpiresAt: activeOAuthExpiresAt,
    oauthError: activeOAuthError,
  });
  const modelOptions = modelsFor(settings, modelResult);
  const selectedModelValue = modelOptions.some((model) => model.id === settings.activeModel)
    ? settings.activeModel
    : "";
  const canLoadModels = activeAuthState.request !== null;
  const modelStatus = modelStatusText(activeProvider, activeAuthState, loadingModels, modelResult);
  const modelStatusClass =
    activeAuthState.severity === "error" ||
    (modelResult?.providerId === settings.activeProvider && modelResult.error)
      ? "text-xs text-destructive"
      : "text-xs text-muted-foreground";

  const setKey = (id: ProviderId, apiKey: string) => {
    setSettings(updateProviderApiKey(settings, id, apiKey));
  };

  const setProvider = (id: ProviderId) => {
    const provider = PROVIDER_CATALOG_BY_ID[id];
    setModelResult(null);
    setLoadingModels(false);
    setSettings({ ...settings, activeProvider: id, activeModel: provider.defaultModel });
  };

  const save = async () => {
    const next = await felix.invoke("settings.set", settings);
    setSettings(next);
    setSaved(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSaved(false);
      saveTimeoutRef.current = null;
    }, 1500);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-12 items-center justify-between border-b border-border pl-20 pr-3">
        <span className="text-sm font-semibold tracking-tight">Settings</span>
        <Button variant="ghost" size="sm" onClick={goDashboard}>
          Done
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col gap-5 px-6 py-10">
          <Card className="flex flex-col gap-4 p-5">
            <div>
              <h2 className="text-sm font-medium">AI Provider</h2>
              <p className="text-xs text-muted-foreground">Which model Felix uses to help build.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Provider</label>
              <Select
                value={settings.activeProvider}
                onValueChange={(value) => setProvider(value as ProviderId)}
              >
                <SelectTrigger className="w-full" />
                <SelectContent>
                  <SelectGroup>
                    {PROVIDER_CATALOG.map((provider, index) => (
                      <SelectItem key={provider.id} index={index} value={provider.id}>
                        {provider.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              {activeProvider.auth.type === "api_key" ? (
                <InputGroup className="w-full">
                  <InputField
                    index={0}
                    type="password"
                    label={activeProvider.auth.label}
                    value={activeApiKey}
                    onChange={(value) => setKey(activeProvider.id, value)}
                    placeholder={activeProvider.auth.placeholder}
                  />
                </InputGroup>
              ) : (
                <Button variant="tertiary" size="sm" disabled className="self-start">
                  {activeOAuthAccessToken ? "Re-authorize" : "Authorize"}
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Model</label>
              <div className="flex gap-2">
                <Select
                  value={selectedModelValue}
                  onValueChange={(value) => setSettings({ ...settings, activeModel: value })}
                  disabled={!canLoadModels || loadingModels || modelOptions.length === 0}
                >
                  <SelectTrigger
                    className="min-w-0 flex-1"
                    placeholder={modelPlaceholderText(canLoadModels, loadingModels)}
                  />
                  <SelectContent>
                    <SelectGroup>
                      {modelOptions.map((model, index) => (
                        <SelectItem key={model.id} index={index} value={model.id}>
                          {model.name === model.id ? model.id : `${model.name} (${model.id})`}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  variant="tertiary"
                  size="sm"
                  leadingIcon={RefreshIcon}
                  onClick={() => setModelRefreshToken((current) => current + 1)}
                  disabled={!canLoadModels || loadingModels}
                  title="Refresh models"
                  aria-label="Refresh models"
                >
                  Refresh
                </Button>
              </div>
              <p className={modelStatusClass}>{modelStatus}</p>
            </div>
          </Card>

          <Card className="flex items-center justify-between gap-4 p-5">
            <div>
              <h2 className="text-sm font-medium">Allow apps to use the internet</h2>
              <p className="text-xs text-muted-foreground">
                Lets mini apps load things online. Turn off for extra safety.
              </p>
            </div>
            <Switch
              checked={settings.sandboxAllowNetwork}
              label={settings.sandboxAllowNetwork ? "On" : "Off"}
              onToggle={() =>
                setSettings({ ...settings, sandboxAllowNetwork: !settings.sandboxAllowNetwork })
              }
            />
          </Card>

          <Button className="self-end" onClick={() => void save()}>
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function keyFor(settings: FelixSettings, id: ProviderId): string {
  return providerConfigFor(settings, id)?.apiKey ?? "";
}

function providerConfigFor(settings: FelixSettings, id: ProviderId): ProviderConfig | null {
  return settings.providers.find((provider) => provider.id === id) ?? null;
}

function updateProviderApiKey(
  settings: FelixSettings,
  id: ProviderId,
  apiKey: string,
): FelixSettings {
  const existingProvider = providerConfigFor(settings, id);
  const providers = settings.providers.filter((provider) => provider.id !== id);
  const trimmedKey = apiKey.trim();

  if (trimmedKey.length === 0 && !existingProvider?.oauth) {
    return { ...settings, providers };
  }

  return {
    ...settings,
    providers: [...providers, { ...(existingProvider ?? {}), id, apiKey }],
  };
}

function modelsFor(
  settings: FelixSettings,
  modelResult: ProviderModelsResponse | null,
): ProviderModel[] {
  return modelResult?.providerId === settings.activeProvider ? [...modelResult.models] : [];
}

function modelStatusText(
  provider: ProviderCatalogEntry,
  authState: ProviderAuthState,
  loading: boolean,
  modelResult: ProviderModelsResponse | null,
): string {
  if (authState.message) return authState.message;
  if (loading) return `Loading models from ${provider.label}...`;
  if (!modelResult || modelResult.providerId !== provider.id) {
    return `Ready to load ${provider.label} models.`;
  }
  if (modelResult.source === "provider") {
    return `${modelResult.models.length} models loaded from ${provider.label}.`;
  }
  if (modelResult.source === "local") {
    return modelResult.error
      ? `${modelResult.models.length} models loaded from the local OpenCode registry. ${modelResult.error}`
      : `${modelResult.models.length} models loaded from the local OpenCode registry.`;
  }
  if (modelResult.source === "fallback") {
    return modelResult.error
      ? `Using ${provider.label}'s saved model list. ${modelResult.error}`
      : `Using ${provider.label}'s saved model list.`;
  }
  return modelResult.error ?? `No ${provider.label} models are available.`;
}

function modelPlaceholderText(canLoadModels: boolean, loadingModels: boolean): string {
  if (!canLoadModels) return "Authorize provider";
  if (loadingModels) return "Loading models";
  return "No models loaded";
}

interface AuthStateInput {
  apiKey: string;
  oauthAccessToken: string;
  oauthExpiresAt: string;
  oauthError: string;
}

interface ProviderAuthState {
  request: Omit<ProviderModelsRequest, "providerId"> | null;
  message: string | null;
  severity: "muted" | "error";
}

function authStateFor(provider: ProviderCatalogEntry, input: AuthStateInput): ProviderAuthState {
  if (provider.auth.type === "api_key") {
    const apiKey = input.apiKey.trim();
    return apiKey.length > 0
      ? { request: { apiKey }, message: null, severity: "muted" }
      : {
          request: null,
          message: `Enter ${provider.auth.label} to load ${provider.label} models.`,
          severity: "muted",
        };
  }

  if (input.oauthError.trim().length > 0) {
    return {
      request: null,
      message: `${provider.label} authorization failed: ${input.oauthError}`,
      severity: "error",
    };
  }

  if (input.oauthAccessToken.trim().length === 0) {
    return {
      request: null,
      message: `Authorize ${provider.label} to load models.`,
      severity: "muted",
    };
  }

  if (isExpired(input.oauthExpiresAt)) {
    return {
      request: null,
      message: `${provider.label} authorization expired. Re-authorize and try again.`,
      severity: "error",
    };
  }

  return {
    request: { oauthAccessToken: input.oauthAccessToken.trim() },
    message: null,
    severity: "muted",
  };
}

function isExpired(expiresAt: string): boolean {
  if (expiresAt.trim().length === 0) return false;
  const expiresAtMs = Date.parse(expiresAt);
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now();
}
