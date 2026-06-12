import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  ChatAttachmentInput,
  ChatStep,
  ChatTurn,
  ExtensionUiResponse,
  MiniAppStatus,
  MiniAppSummary,
  ProfileOverview,
} from "@felix/contracts";
import { felix } from "./bridge.ts";

export type View =
  | { name: "dashboard" }
  | { name: "miniApp"; appId: string; buildChatInitiallyOpen: boolean }
  | { name: "settings" };

export type DashboardTab = "apps" | "build" | "profile";

interface StoreValue {
  view: View;
  dashboardTab: DashboardTab;
  apps: MiniAppSummary[];
  statuses: Record<string, { status: MiniAppStatus; devUrl: string | null }>;
  chats: Record<string, ChatTurn[]>;
  felixThinking: Record<string, boolean>;
  uiRequests: Record<string, UiRequest[]>;
  profileOverview: ProfileOverview | null;
  profileLoading: boolean;
  setDashboardTab: (tab: DashboardTab) => void;
  goDashboard: () => void;
  goSettings: () => void;
  refreshProfile: () => Promise<void>;
  setProfileName: (name: string) => Promise<void>;
  openApp: (appId: string) => Promise<void>;
  createApp: (prompt: string, attachments?: ChatAttachmentInput[]) => Promise<void>;
  deleteApp: (appId: string) => Promise<void>;
  clearChat: (appId: string) => Promise<void>;
  sendChat: (appId: string, text: string, attachments?: ChatAttachmentInput[]) => Promise<void>;
  abortChat: (appId: string) => Promise<void>;
  respondToUiRequest: (appId: string, response: ExtensionUiResponse) => Promise<void>;
}

export type UiRequest = Extract<
  import("@felix/contracts").AgentEvent,
  { type: "extension_ui_request" }
>["request"];

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>({ name: "dashboard" });
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>("build");
  const [apps, setApps] = useState<MiniAppSummary[]>([]);
  const [statuses, setStatuses] = useState<StoreValue["statuses"]>({});
  const [chats, setChats] = useState<Record<string, ChatTurn[]>>({});
  const [felixThinking, setFelixThinking] = useState<Record<string, boolean>>({});
  const [uiRequests, setUiRequests] = useState<Record<string, UiRequest[]>>({});
  const [profileOverview, setProfileOverview] = useState<ProfileOverview | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const refreshApps = useCallback(async () => {
    const list = await felix.invoke("miniApp.list", undefined);
    setApps(list);
  }, []);

  useEffect(() => {
    void refreshApps();
  }, [refreshApps]);

  const refreshProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const profile = await felix.invoke("profile.get", undefined);
      setProfileOverview(profile);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    return felix.onPush((event) => {
      if (event.kind === "status") {
        setStatuses((prev) => ({
          ...prev,
          [event.appId]: { status: event.status, devUrl: event.devUrl },
        }));
      } else if (event.kind === "chatTurn") {
        setChats((prev) => ({
          ...prev,
          [event.appId]: appendIncomingTurn(prev[event.appId] ?? [], event.turn),
        }));
      } else if (event.kind === "miniAppUpdated") {
        setApps((prev) =>
          prev.map((a) => (a.id === event.appId ? event.summary : a)),
        );
      } else if (event.kind === "profileUpdated") {
        setProfileOverview(event.profile);
        setProfileLoading(false);
      } else if (event.kind === "agent") {
        const e = event.event;
        if (e.type === "agent_start") {
          setFelixThinking((p) => ({ ...p, [event.appId]: true }));
          startFelixTurn(event.appId);
        } else if (e.type === "agent_end") {
          setFelixThinking((p) => ({ ...p, [event.appId]: false }));
          finishFelixTurn(event.appId, "done");
        } else if (e.type === "text_delta") {
          appendTurnText(event.appId, e.delta);
        } else if (e.type === "tool_start") {
          addTurnStep(event.appId, {
            type: "tool",
            toolName: e.toolName,
            label: e.label ?? e.toolName,
            detail: e.detail,
          });
        } else if (e.type === "tool_end") {
          markToolEnd(event.appId, e.toolName, e.isError);
        } else if (e.type === "error") {
          setFelixThinking((p) => ({ ...p, [event.appId]: false }));
          finishFelixTurn(event.appId, "error", userFacingAgentError(e.message));
        } else if (e.type === "extension_ui_request") {
          handleUiRequest(event.appId, e.request);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadChat = useCallback(async (appId: string) => {
    const history = await felix.invoke("chat.history", { appId });
    setChats((prev) => ({ ...prev, [appId]: history }));
  }, []);

  const mutateFelixTurn = useCallback(
    (appId: string, mutate: (turn: ChatTurn) => ChatTurn) => {
      setChats((prev) => {
        const list = prev[appId] ?? [];
        const index = activeFelixTurnIndex(list);
        if (index === -1) return prev;
        const activeTurn = list[index];
        if (!activeTurn) return prev;
        return { ...prev, [appId]: replaceTurnAtEnd(list, index, mutate(activeTurn)) };
      });
    },
    [],
  );

  const startFelixTurn = useCallback((appId: string) => {
    setChats((prev) => {
      const list = prev[appId] ?? [];
      const activeIndex = activeFelixTurnIndex(list);
      if (activeIndex !== -1) {
        return { ...prev, [appId]: moveTurnToEnd(list, activeIndex) };
      }

      const retryableIndex = retryableFelixTurnIndex(list);
      const retryableTurn = list[retryableIndex];
      if (retryableTurn) {
        return {
          ...prev,
          [appId]: replaceTurnAtEnd(list, retryableIndex, {
            ...retryableTurn,
            status: "working",
            text: lastTextOf(retryableTurn),
          }),
        };
      }

      const turn: ChatTurn = {
        id: newLiveTurnId("live"),
        role: "felix",
        text: "",
        steps: [],
        attachments: [],
        status: "working",
        createdAt: new Date().toISOString(),
      };
      return { ...prev, [appId]: [...list, turn] };
    });
  }, []);

  const lastTextOf = (turn: ChatTurn): string => {
    for (let i = turn.steps.length - 1; i >= 0; i -= 1) {
      const step = turn.steps[i];
      if (step?.type === "text" && step.text.trim().length > 0) return step.text;
    }
    return "";
  };

  const appendTurnText = useCallback(
    (appId: string, delta: string) => {
      mutateFelixTurn(appId, (turn) => {
        const steps = [...turn.steps];
        const last = steps[steps.length - 1];
        if (last && last.type === "text") {
          steps[steps.length - 1] = { type: "text", text: last.text + delta };
        } else {
          steps.push({ type: "text", text: delta });
        }
        const next = { ...turn, steps };
        return { ...next, text: lastTextOf(next) };
      });
    },
    [mutateFelixTurn],
  );

  const addTurnStep = useCallback(
    (appId: string, step: ChatStep) => {
      mutateFelixTurn(appId, (turn) => ({ ...turn, steps: [...turn.steps, step] }));
    },
    [mutateFelixTurn],
  );

  const markToolEnd = useCallback(
    (appId: string, toolName: string, isError: boolean) => {
      mutateFelixTurn(appId, (turn) => {
        const steps = [...turn.steps];
        for (let i = steps.length - 1; i >= 0; i -= 1) {
          const step = steps[i];
          if (step?.type === "tool" && step.toolName === toolName && step.isError === undefined) {
            steps[i] = { ...step, isError };
            break;
          }
        }
        return { ...turn, steps };
      });
    },
    [mutateFelixTurn],
  );

  const finishFelixTurn = useCallback(
    (appId: string, status: ChatTurn["status"], fallbackText?: string) => {
      setChats((prev) => {
        const list = prev[appId] ?? [];
        const activeIndex = activeFelixTurnIndex(list);
        if (activeIndex === -1) {
          if (status !== "error") return prev;
          const lastFelix = list[lastFelixTurnIndex(list)];
          if (lastFelix?.status === "error") return prev;
          const turn: ChatTurn = {
            id: newLiveTurnId("live-error"),
            role: "felix",
            text: fallbackText ?? "Oops, something went wrong.",
            steps: [],
            attachments: [],
            status,
            createdAt: new Date().toISOString(),
          };
          return { ...prev, [appId]: [...list, turn] };
        }
        const last = list[activeIndex];
        if (!last) return prev;
        if (last.status === "error" && status === "done") return prev;
        const text = lastTextOf(last);
        const turn = {
          ...last,
          status,
          text:
            status === "error" && fallbackText
              ? errorText(text.length > 0 ? text : last.text, fallbackText)
              : text.length > 0
                ? text
                : (fallbackText ?? last.text),
        };
        return { ...prev, [appId]: replaceTurnAtEnd(list, activeIndex, turn) };
      });
    },
    [],
  );

  const openApp = useCallback(
    async (appId: string) => {
      setView({ name: "miniApp", appId, buildChatInitiallyOpen: false });
      const summary = await felix.invoke("miniApp.open", { appId });
      setStatuses((prev) => ({
        ...prev,
        [appId]: { status: summary.status, devUrl: summary.devUrl },
      }));
      await reloadChat(appId);
    },
    [reloadChat],
  );

  const createApp = useCallback(
    async (prompt: string, attachments: ChatAttachmentInput[] = []) => {
      const summary = await felix.invoke("miniApp.create", { prompt });
      await refreshApps();
      setView({ name: "miniApp", appId: summary.id, buildChatInitiallyOpen: true });
      setStatuses((prev) => ({
        ...prev,
        [summary.id]: { status: summary.status, devUrl: summary.devUrl },
      }));
      await felix.invoke("miniApp.open", { appId: summary.id });
      await felix.invoke("chat.send", { appId: summary.id, text: prompt, attachments });
    },
    [refreshApps],
  );

  const deleteApp = useCallback(
    async (appId: string) => {
      await felix.invoke("miniApp.delete", { appId });
      setStatuses((prev) => {
        const next = { ...prev };
        delete next[appId];
        return next;
      });
      setChats((prev) => {
        const next = { ...prev };
        delete next[appId];
        return next;
      });
      setFelixThinking((prev) => {
        const next = { ...prev };
        delete next[appId];
        return next;
      });
      setUiRequests((prev) => {
        const next = { ...prev };
        delete next[appId];
        return next;
      });
      await refreshApps();
      setView({ name: "dashboard" });
    },
    [refreshApps],
  );

  const sendChat = useCallback(
    async (appId: string, text: string, attachments: ChatAttachmentInput[] = []) => {
      await felix.invoke("chat.send", { appId, text, attachments });
    },
    [],
  );

  const clearChat = useCallback(async (appId: string) => {
    await felix.invoke("chat.clear", { appId });
    setChats((prev) => ({ ...prev, [appId]: [] }));
    setFelixThinking((prev) => ({ ...prev, [appId]: false }));
    setUiRequests((prev) => {
      const next = { ...prev };
      delete next[appId];
      return next;
    });
  }, []);

  const abortChat = useCallback(async (appId: string) => {
    await felix.invoke("chat.abort", { appId });
  }, []);

  const handleUiRequest = useCallback((appId: string, request: UiRequest) => {
    if (["notify", "setStatus", "setWidget", "setTitle", "set_editor_text"].includes(request.method)) {
      return;
    }
    setUiRequests((prev) => ({
      ...prev,
      [appId]: [...(prev[appId] ?? []), request],
    }));
  }, []);

  const respondToUiRequest = useCallback(
    async (appId: string, response: ExtensionUiResponse) => {
      setUiRequests((prev) => ({
        ...prev,
        [appId]: (prev[appId] ?? []).filter((request) => request.id !== response.id),
      }));
      await felix.invoke("agent.ui.respond", { appId, response });
    },
    [],
  );

  const setProfileName = useCallback(async (name: string) => {
    const profile = await felix.invoke("profile.setName", { name });
    setProfileOverview(profile);
    setProfileLoading(false);
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      view,
      dashboardTab,
      apps,
      statuses,
      chats,
      felixThinking,
      uiRequests,
      profileOverview,
      profileLoading,
      setDashboardTab,
      goDashboard: () => setView({ name: "dashboard" }),
      goSettings: () => setView({ name: "settings" }),
      refreshProfile,
      setProfileName,
      openApp,
      createApp,
      deleteApp,
      clearChat,
      sendChat,
      abortChat,
      respondToUiRequest,
    }),
    [
      view,
      dashboardTab,
      apps,
      statuses,
      chats,
      felixThinking,
      uiRequests,
      profileOverview,
      profileLoading,
      refreshProfile,
      setProfileName,
      openApp,
      createApp,
      deleteApp,
      clearChat,
      sendChat,
      abortChat,
      respondToUiRequest,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

function newLiveTurnId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function appendIncomingTurn(list: ChatTurn[], turn: ChatTurn): ChatTurn[] {
  const existingIndex = list.findIndex((item) => item.id === turn.id);
  if (existingIndex === -1) return [...list, turn];
  const next = [...list];
  next[existingIndex] = turn;
  return next;
}

function activeFelixTurnIndex(turns: ChatTurn[]): number {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn?.role === "felix" && turn.status === "working") return i;
  }
  return -1;
}

function retryableFelixTurnIndex(turns: ChatTurn[]): number {
  const lastIndex = turns.length - 1;
  const last = turns[lastIndex];
  return last?.role === "felix" && last.status === "error" ? lastIndex : -1;
}

function lastFelixTurnIndex(turns: ChatTurn[]): number {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i]?.role === "felix") return i;
  }
  return -1;
}

function replaceTurnAtEnd(turns: ChatTurn[], index: number, turn: ChatTurn): ChatTurn[] {
  const next = [...turns];
  next[index] = turn;
  return index === next.length - 1 ? next : moveTurnToEnd(next, index);
}

function moveTurnToEnd(turns: ChatTurn[], index: number): ChatTurn[] {
  const next = [...turns];
  const [turn] = next.splice(index, 1);
  return turn ? [...next, turn] : turns;
}

function errorText(currentText: string, fallbackText: string): string {
  const current = currentText.trim();
  const fallback = fallbackText.trim();
  if (current.length === 0) return fallback;
  if (current.includes(fallback)) return currentText;
  return `${current}\n\n${fallback}`;
}

function userFacingAgentError(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length === 0) return "Oops, something went wrong.";
  if (trimmed.startsWith("Felix ")) return trimmed;
  return `Oops, something went wrong. ${trimmed}`;
}
