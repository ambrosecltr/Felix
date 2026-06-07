import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  PROVIDER_CATALOG,
  PROVIDER_CATALOG_BY_ID,
  WEB_SEARCH_PROVIDER_CATALOG,
  WEB_SEARCH_PROVIDER_CATALOG_BY_ID,
  type FelixSettings,
  type ProviderCatalogEntry,
  type ProviderConfig,
  type ProviderId,
  type ProviderModel,
  type ProviderModelsRequest,
  type ProviderModelsResponse,
  type WebSearchProviderId,
} from "@felix/contracts";
import { felix } from "../bridge.ts";
import { useIcon } from "../lib/icon-context.tsx";
import { cn } from "../lib/utils.ts";
import { useStore } from "../store.tsx";
import { AppChromeHeader } from "../components/AppChromeHeader.tsx";
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

type SettingsTab = "provider" | "icons" | "integrations" | "permissions" | "lockdown";

interface SettingsTabItem {
  id: SettingsTab;
  label: string;
}

interface SectionSaveState {
  saving: boolean;
  saved: boolean;
  error: string | null;
}

const SETTINGS_TABS: SettingsTabItem[] = [
  {
    id: "provider",
    label: "Provider settings"
  },
  {
    id: "icons",
    label: "App icons"
  },
  {
    id: "integrations",
    label: "Integrations"
  },
  {
    id: "permissions",
    label: "Permissions"
  },
  {
    id: "lockdown",
    label: "Lockdown"
  },
];

const INITIAL_SECTION_STATE: Record<SettingsTab, SectionSaveState> = {
  provider: { saving: false, saved: false, error: null },
  icons: { saving: false, saved: false, error: null },
  integrations: { saving: false, saved: false, error: null },
  permissions: { saving: false, saved: false, error: null },
  lockdown: { saving: false, saved: false, error: null },
};

const SETTINGS_PANEL_VARIANTS = {
  initial: (direction: number) => ({
    opacity: 0,
    y: direction > 0 ? 10 : -10,
    scale: 0.995,
  }),
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  exit: (direction: number) => ({
    opacity: 0,
    y: direction > 0 ? -10 : 10,
    scale: 0.995,
  }),
};

export function Settings() {
  const { goDashboard } = useStore();
  const [settings, setSettings] = useState<FelixSettings | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("provider");
  const [tabDirection, setTabDirection] = useState(1);
  const [sectionState, setSectionState] =
    useState<Record<SettingsTab, SectionSaveState>>(INITIAL_SECTION_STATE);
  const [modelResult, setModelResult] = useState<ProviderModelsResponse | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelRefreshToken, setModelRefreshToken] = useState(0);
  const [lockdownPin, setLockdownPin] = useState("");
  const [lockdownConfirmPin, setLockdownConfirmPin] = useState("");
  const [lockdownConfigured, setLockdownConfigured] = useState(false);
  const saveTimeoutRefs = useRef<Partial<Record<SettingsTab, ReturnType<typeof setTimeout>>>>({});
  const modelRequestRef = useRef(0);
  const shouldReduceMotion = useReducedMotion();
  const RefreshIcon = useIcon("rotate-ccw");

  const activeProviderId = settings?.activeProvider;
  const activeApiKey = settings && activeProviderId ? keyFor(settings, activeProviderId) : "";
  const activeProviderConfig =
    settings && activeProviderId ? providerConfigFor(settings, activeProviderId) : null;
  const activeOAuthAccessToken = activeProviderConfig?.oauth?.accessToken ?? "";
  const activeOAuthExpiresAt = activeProviderConfig?.oauth?.expiresAt ?? "";
  const activeOAuthError = activeProviderConfig?.oauth?.error ?? "";

  useEffect(() => {
    void Promise.all([
      felix.invoke("settings.get", undefined),
      felix.invoke("settings.lockdown.status", undefined),
    ]).then(([nextSettings, lockdownStatus]) => {
      setSettings(nextSettings);
      setLockdownConfigured(lockdownStatus.enabled);
    });
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
    const currentModel = modelResult.models.find((model) => model.id === settings.activeModel);
    if (currentModel) {
      const nextInputModalities = currentModel.inputModalities ?? null;
      if (sameInputModalities(settings.activeModelInputModalities, nextInputModalities)) return;
      setSettings((current) => {
        if (!current || current.activeProvider !== modelResult.providerId) return current;
        if (current.activeModel !== currentModel.id) return current;
        return { ...current, activeModelInputModalities: nextInputModalities };
      });
      return;
    }

    const provider = PROVIDER_CATALOG_BY_ID[settings.activeProvider];
    const nextModel =
      modelResult.models.find((model) => model.id === provider.defaultModel) ??
      modelResult.models[0];
    if (!nextModel) return;

    setSettings((current) => {
      if (!current || current.activeProvider !== modelResult.providerId) return current;
      if (current.activeModel === nextModel.id) return current;
      return {
        ...current,
        activeModel: nextModel.id,
        activeModelInputModalities: nextModel.inputModalities ?? null,
      };
    });
  }, [modelResult, settings]);

  useEffect(() => {
    return () => {
      for (const timeout of Object.values(saveTimeoutRefs.current)) {
        if (timeout) clearTimeout(timeout);
      }
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
  const iconGeneration = settings.iconGeneration;
  const webSearch = settings.webSearch;
  const activeWebSearchProvider = WEB_SEARCH_PROVIDER_CATALOG_BY_ID[webSearch.provider];
  const activeWebSearchApiKey = webSearch.apiKeys[webSearch.provider] ?? "";
  const activeWebSearchBaseUrl =
    webSearch.baseUrls[webSearch.provider] ?? activeWebSearchProvider.defaultBaseUrl ?? "";
  const lockdown = settings.lockdown;
  const lockdownHasPin = lockdownConfigured;

  const setSectionStatus = (section: SettingsTab, next: Partial<SectionSaveState>) => {
    setSectionState((current) => ({
      ...current,
      [section]: { ...current[section], ...next },
    }));
  };

  const selectTab = (nextTab: SettingsTab) => {
    if (nextTab === activeTab) return;
    setTabDirection(tabIndex(nextTab) > tabIndex(activeTab) ? 1 : -1);
    setActiveTab(nextTab);
  };

  const markSectionDirty = (section: SettingsTab) => {
    if (saveTimeoutRefs.current[section]) {
      clearTimeout(saveTimeoutRefs.current[section]);
      delete saveTimeoutRefs.current[section];
    }
    setSectionStatus(section, { saved: false, error: null });
  };

  const updateSettings = (
    section: SettingsTab,
    update: (current: FelixSettings) => FelixSettings,
  ) => {
    markSectionDirty(section);
    setSettings((current) => (current ? update(current) : current));
  };

  const setKey = (id: ProviderId, apiKey: string) => {
    updateSettings("provider", (current) => updateProviderApiKey(current, id, apiKey));
  };

  const setProvider = (id: ProviderId) => {
    const provider = PROVIDER_CATALOG_BY_ID[id];
    setModelResult(null);
    setLoadingModels(false);
    updateSettings("provider", (current) => ({
      ...current,
      activeProvider: id,
      activeModel: provider.defaultModel,
      activeModelInputModalities: null,
    }));
  };

  const setModel = (id: string) => {
    const model = modelOptions.find((option) => option.id === id);
    updateSettings("provider", (current) => ({
      ...current,
      activeModel: id,
      activeModelInputModalities: model?.inputModalities ?? null,
    }));
  };

  const setIconGeneration = (iconSettings: FelixSettings["iconGeneration"]) => {
    updateSettings("icons", (current) => ({ ...current, iconGeneration: iconSettings }));
  };

  const setWebSearchProvider = (id: WebSearchProviderId) => {
    const provider = WEB_SEARCH_PROVIDER_CATALOG_BY_ID[id];
    updateSettings("integrations", (current) => {
      const baseUrls = { ...current.webSearch.baseUrls };
      if (provider.defaultBaseUrl && !baseUrls[id]) baseUrls[id] = provider.defaultBaseUrl;
      return {
        ...current,
        webSearch: {
          ...current.webSearch,
          provider: id,
          baseUrls,
        },
      };
    });
  };

  const setWebSearchApiKey = (apiKey: string) => {
    updateSettings("integrations", (current) => ({
      ...current,
      webSearch: {
        ...current.webSearch,
        apiKeys: {
          ...current.webSearch.apiKeys,
          [current.webSearch.provider]: apiKey,
        },
      },
    }));
  };

  const setWebSearchBaseUrl = (baseUrl: string) => {
    updateSettings("integrations", (current) => ({
      ...current,
      webSearch: {
        ...current.webSearch,
        baseUrls: {
          ...current.webSearch.baseUrls,
          [current.webSearch.provider]: baseUrl,
        },
      },
    }));
  };

  const setLockdownEnabled = (enabled: boolean) => {
    updateSettings("lockdown", (current) => ({
      ...current,
      lockdown: {
        ...current.lockdown,
        enabled,
      },
    }));
  };

  const setSanitizedLockdownPin = (value: string) => {
    markSectionDirty("lockdown");
    setLockdownPin(sanitizePin(value));
  };

  const setSanitizedLockdownConfirmPin = (value: string) => {
    markSectionDirty("lockdown");
    setLockdownConfirmPin(sanitizePin(value));
  };

  const saveSection = async (section: SettingsTab) => {
    setSectionStatus(section, { saving: true, saved: false, error: null });
    try {
      const latest = await felix.invoke("settings.get", undefined);
      const next = await felix.invoke("settings.set", mergeSection(latest, settings, section));
      setSettings((current) => applySavedSection(current ?? next, next, section));
      setSectionStatus(section, { saving: false, saved: true, error: null });
      if (saveTimeoutRefs.current[section]) clearTimeout(saveTimeoutRefs.current[section]);
      saveTimeoutRefs.current[section] = setTimeout(() => {
        setSectionStatus(section, { saved: false });
        delete saveTimeoutRefs.current[section];
      }, 1500);
    } catch (error) {
      setSectionStatus(section, {
        saving: false,
        saved: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const saveLockdownSection = async () => {
    setSectionStatus("lockdown", { saving: true, saved: false, error: null });
    try {
      const nextEnabled = settings.lockdown.enabled;
      const nextPin = lockdownPin.trim();

      if (nextEnabled && !lockdownHasPin && nextPin.length === 0) {
        throw new Error("Enter a 4 digit PIN.");
      }
      if (nextEnabled && nextPin.length > 0 && nextPin.length !== 4) {
        throw new Error("Enter a 4 digit PIN.");
      }
      if (nextEnabled && nextPin.length > 0 && nextPin !== lockdownConfirmPin.trim()) {
        throw new Error("PINs do not match.");
      }

      const saved = await felix.invoke("settings.lockdown.set", {
        enabled: nextEnabled,
        pin: nextEnabled && nextPin.length > 0 ? nextPin : undefined,
      });
      setSettings((current) => applySavedSection(current ?? saved, saved, "lockdown"));
      setLockdownConfigured(nextEnabled);
      setLockdownPin("");
      setLockdownConfirmPin("");
      setSectionStatus("lockdown", { saving: false, saved: true, error: null });
      if (saveTimeoutRefs.current.lockdown) clearTimeout(saveTimeoutRefs.current.lockdown);
      saveTimeoutRefs.current.lockdown = setTimeout(() => {
        setSectionStatus("lockdown", { saved: false });
        delete saveTimeoutRefs.current.lockdown;
      }, 1500);
    } catch (error) {
      setSectionStatus("lockdown", {
        saving: false,
        saved: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <AppChromeHeader
        center={<span className="text-sm font-semibold tracking-tight">Settings</span>}
        right={
          <Button variant="ghost" size="sm" onClick={goDashboard}>
            Done
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-5xl items-start gap-6 px-8 py-8 max-[820px]:flex-col max-[820px]:px-4 max-[820px]:py-5">
          <Card className="sticky top-8 w-56 shrink-0 p-2 max-[820px]:static max-[820px]:w-full">
            <nav
              aria-label="Settings sections"
              className="flex flex-col gap-1 max-[820px]:grid max-[820px]:grid-cols-2"
            >
              {SETTINGS_TABS.map((tab) => (
                <SettingsTabButton
                  key={tab.id}
                  tab={tab}
                  active={activeTab === tab.id}
                  reducedMotion={shouldReduceMotion}
                  onSelect={selectTab}
                />
              ))}
            </nav>
          </Card>

          <main className="flex min-w-0 max-w-2xl flex-1 flex-col gap-5">
            <AnimatePresence mode="wait" initial={false} custom={tabDirection}>
              {activeTab === "provider" ? (
                <SettingsMotionPanel
                  key="provider"
                  direction={tabDirection}
                  reducedMotion={shouldReduceMotion}
                >
                  <SettingsSection
                    title="Provider settings"
                    description="Which model Felix uses to help build."
                    status={sectionState.provider}
                    onSave={() => void saveSection("provider")}
                  >
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
                      onValueChange={setModel}
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
                  </SettingsSection>
                </SettingsMotionPanel>
              ) : null}

              {activeTab === "icons" ? (
                <SettingsMotionPanel
                  key="icons"
                  direction={tabDirection}
                  reducedMotion={shouldReduceMotion}
                >
                  <SettingsSection
                    title="App icon generator"
                    description="Enable xAI image generation for mini app dashboard icons."
                    status={sectionState.icons}
                    onSave={() => void saveSection("icons")}
                  >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-medium">Generated app icons</h2>
                    <p className="text-xs text-muted-foreground">
                      Uses Grok Imagine for square icons.
                    </p>
                  </div>
                  <Switch
                    checked={iconGeneration.enabled}
                    label={iconGeneration.enabled ? "On" : "Off"}
                    onToggle={() =>
                      setIconGeneration({
                        ...iconGeneration,
                        enabled: !iconGeneration.enabled,
                      })
                    }
                  />
                </div>
                <InputGroup className="w-full">
                  <InputField
                    index={0}
                    type="password"
                    label="xAI API Key"
                    value={iconGeneration.xaiApiKey}
                    onChange={(value) =>
                      setIconGeneration({
                        ...iconGeneration,
                        xaiApiKey: value,
                      })
                    }
                    placeholder="xai-..."
                    disabled={!iconGeneration.enabled}
                  />
                </InputGroup>
                  </SettingsSection>
                </SettingsMotionPanel>
              ) : null}

              {activeTab === "integrations" ? (
                <SettingsMotionPanel
                  key="integrations"
                  direction={tabDirection}
                  reducedMotion={shouldReduceMotion}
                >
                  <SettingsSection
                    title="Integrations"
                    description="Configure extra tools Felix can use while building."
                    status={sectionState.integrations}
                    onSave={() => void saveSection("integrations")}
                  >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-medium">Web search</h2>
                  </div>
                  <Switch
                    checked={webSearch.enabled}
                    label={webSearch.enabled ? "On" : "Off"}
                    onToggle={() =>
                      updateSettings("integrations", (current) => ({
                        ...current,
                        webSearch: {
                          ...current.webSearch,
                          enabled: !current.webSearch.enabled,
                        },
                      }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Provider</label>
                  <Select
                    value={webSearch.provider}
                    onValueChange={(value) => setWebSearchProvider(value as WebSearchProviderId)}
                    disabled={!webSearch.enabled}
                  >
                    <SelectTrigger className="w-full" />
                    <SelectContent>
                      <SelectGroup>
                        {WEB_SEARCH_PROVIDER_CATALOG.map((provider, index) => (
                          <SelectItem key={provider.id} index={index} value={provider.id}>
                            {provider.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <InputGroup className="w-full">
                  <InputField
                    index={0}
                    type="password"
                    label={`${activeWebSearchProvider.label} API Key`}
                    value={activeWebSearchApiKey}
                    onChange={setWebSearchApiKey}
                    placeholder={activeWebSearchProvider.apiKeyPlaceholder}
                    disabled={!webSearch.enabled}
                  />
                </InputGroup>
                {activeWebSearchProvider.baseUrlEnvVar && (
                  <InputGroup className="w-full">
                    <InputField
                      index={0}
                      label={`${activeWebSearchProvider.label} URL`}
                      value={activeWebSearchBaseUrl}
                      onChange={setWebSearchBaseUrl}
                      placeholder={activeWebSearchProvider.defaultBaseUrl}
                      disabled={!webSearch.enabled}
                    />
                  </InputGroup>
                )}
                  </SettingsSection>
                </SettingsMotionPanel>
              ) : null}

              {activeTab === "permissions" ? (
                <SettingsMotionPanel
                  key="permissions"
                  direction={tabDirection}
                  reducedMotion={shouldReduceMotion}
                >
                  <SettingsSection
                    title="Permissions"
                    description="Control what generated apps can reach."
                    status={sectionState.permissions}
                    onSave={() => void saveSection("permissions")}
                  >
                <div className="flex items-center justify-between gap-4">
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
                      updateSettings("permissions", (current) => ({
                        ...current,
                        sandboxAllowNetwork: !current.sandboxAllowNetwork,
                      }))
                    }
                  />
                </div>
                  </SettingsSection>
                </SettingsMotionPanel>
              ) : null}

              {activeTab === "lockdown" ? (
                <SettingsMotionPanel
                  key="lockdown"
                  direction={tabDirection}
                  reducedMotion={shouldReduceMotion}
                >
                  <SettingsSection
                    title="Lockdown"
                    description="Require a 4 digit PIN before opening Settings."
                    status={sectionState.lockdown}
                    onSave={() => void saveLockdownSection()}
                  >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-medium">Settings PIN</h2>
                    <p className="text-xs text-muted-foreground">
                      Adults can use this to keep settings changes protected.
                    </p>
                  </div>
                  <Switch
                    checked={lockdown.enabled}
                    label={lockdown.enabled ? "On" : "Off"}
                    onToggle={() => setLockdownEnabled(!lockdown.enabled)}
                  />
                </div>
                <InputGroup className="w-full">
                  <InputField
                    index={0}
                    type="password"
                    inputMode="numeric"
                    label="4 digit PIN"
                    value={lockdownPin}
                    onChange={setSanitizedLockdownPin}
                    placeholder={lockdownHasPin ? "Leave blank to keep current PIN" : "0000"}
                    disabled={!lockdown.enabled}
                    maxLength={4}
                  />
                </InputGroup>
                <InputGroup className="w-full">
                  <InputField
                    index={0}
                    type="password"
                    inputMode="numeric"
                    label="Confirm PIN"
                    value={lockdownConfirmPin}
                    onChange={setSanitizedLockdownConfirmPin}
                    placeholder={lockdownHasPin ? "Only needed for a new PIN" : "0000"}
                    disabled={!lockdown.enabled}
                    maxLength={4}
                  />
                </InputGroup>
                  </SettingsSection>
                </SettingsMotionPanel>
              ) : null}
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
}

function SettingsTabButton({
  tab,
  active,
  reducedMotion,
  onSelect,
}: {
  tab: SettingsTabItem;
  active: boolean;
  reducedMotion: boolean | null;
  onSelect: (tab: SettingsTab) => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(tab.id)}
      className={cn(
        "relative isolate rounded-xl px-3 py-2 text-left outline-none transition-colors duration-80 focus-visible:ring-1 focus-visible:ring-[#6B97FF]",
        active ? "text-foreground" : "text-muted-foreground hover:bg-hover hover:text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="settings-tab-indicator"
          className="absolute inset-0 -z-10 rounded-xl bg-active shadow-surface-2"
          transition={
            reducedMotion
              ? { duration: 0 }
              : { type: "spring", duration: 0.22, bounce: 0.18 }
          }
        />
      )}
      <span className="relative block truncate text-[13px] font-medium">{tab.label}</span>
      <span className="relative block truncate text-xs text-muted-foreground">
        {tab.description}
      </span>
    </button>
  );
}

function SettingsMotionPanel({
  children,
  direction,
  reducedMotion,
}: {
  children: ReactNode;
  direction: number;
  reducedMotion: boolean | null;
}) {
  return (
    <motion.div
      className="flex flex-col gap-5"
      custom={direction}
      variants={SETTINGS_PANEL_VARIANTS}
      initial={reducedMotion ? { opacity: 0 } : "initial"}
      animate={reducedMotion ? { opacity: 1 } : "animate"}
      exit={reducedMotion ? { opacity: 0 } : "exit"}
      transition={reducedMotion ? { duration: 0 } : { type: "spring", duration: 0.24, bounce: 0.1 }}
    >
      {children}
    </motion.div>
  );
}

function SettingsSection({
  title,
  description,
  status,
  onSave,
  children,
}: {
  title: string;
  description: string;
  status: SectionSaveState;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-5 p-5">
      <div>
        <h1 className="text-sm font-medium">{title}</h1>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
      <div className="flex min-h-7 items-center justify-between gap-3 border-t border-border pt-4">
        <div className="min-w-0 flex-1">
          {status.error ? (
            <p className="truncate text-xs text-destructive" role="alert">
              {status.error}
            </p>
          ) : status.saved ? (
            <p className="text-xs text-muted-foreground">Saved</p>
          ) : null}
        </div>
        <Button size="sm" onClick={onSave} loading={status.saving}>
          {status.saved ? "Saved" : status.saving ? "Saving" : "Save"}
        </Button>
      </div>
    </Card>
  );
}

function mergeSection(
  latest: FelixSettings,
  draft: FelixSettings,
  section: SettingsTab,
): FelixSettings {
  switch (section) {
    case "provider":
      return {
        ...latest,
        activeProvider: draft.activeProvider,
        activeModel: draft.activeModel,
        activeModelInputModalities: draft.activeModelInputModalities,
        providers: draft.providers,
      };
    case "icons":
      return { ...latest, iconGeneration: draft.iconGeneration };
    case "integrations":
      return { ...latest, webSearch: draft.webSearch };
    case "permissions":
      return { ...latest, sandboxAllowNetwork: draft.sandboxAllowNetwork };
    case "lockdown":
      return latest;
  }
}

function applySavedSection(
  current: FelixSettings,
  saved: FelixSettings,
  section: SettingsTab,
): FelixSettings {
  switch (section) {
    case "provider":
      return {
        ...current,
        activeProvider: saved.activeProvider,
        activeModel: saved.activeModel,
        activeModelInputModalities: saved.activeModelInputModalities,
        providers: saved.providers,
      };
    case "icons":
      return { ...current, iconGeneration: saved.iconGeneration };
    case "integrations":
      return { ...current, webSearch: saved.webSearch };
    case "permissions":
      return { ...current, sandboxAllowNetwork: saved.sandboxAllowNetwork };
    case "lockdown":
      return { ...current, lockdown: saved.lockdown };
  }
}

function sanitizePin(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

function tabIndex(tab: SettingsTab): number {
  return SETTINGS_TABS.findIndex((item) => item.id === tab);
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

function sameInputModalities(
  left: FelixSettings["activeModelInputModalities"],
  right: FelixSettings["activeModelInputModalities"],
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
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
