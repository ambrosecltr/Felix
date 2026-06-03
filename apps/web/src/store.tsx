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
  ChatStep,
  ChatTurn,
  MiniAppStatus,
  MiniAppSummary,
} from "@felix/contracts";
import { felix } from "./bridge.ts";

export type View =
  | { name: "dashboard" }
  | { name: "miniApp"; appId: string }
  | { name: "settings" };

interface StoreValue {
  view: View;
  apps: MiniAppSummary[];
  statuses: Record<string, { status: MiniAppStatus; devUrl: string | null }>;
  chats: Record<string, ChatTurn[]>;
  felixThinking: Record<string, boolean>;
  goDashboard: () => void;
  goSettings: () => void;
  openApp: (appId: string) => Promise<void>;
  createApp: (prompt: string) => Promise<void>;
  deleteApp: (appId: string) => Promise<void>;
  sendChat: (appId: string, text: string) => Promise<void>;
  abortChat: (appId: string) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>({ name: "dashboard" });
  const [apps, setApps] = useState<MiniAppSummary[]>([]);
  const [statuses, setStatuses] = useState<StoreValue["statuses"]>({});
  const [chats, setChats] = useState<Record<string, ChatTurn[]>>({});
  const [felixThinking, setFelixThinking] = useState<Record<string, boolean>>({});

  const refreshApps = useCallback(async () => {
    const list = await felix.invoke("miniApp.list", undefined);
    setApps(list);
  }, []);

  useEffect(() => {
    void refreshApps();
  }, [refreshApps]);

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
          [event.appId]: [...(prev[event.appId] ?? []), event.turn],
        }));
      } else if (event.kind === "miniAppUpdated") {
        setApps((prev) =>
          prev.map((a) => (a.id === event.appId ? event.summary : a)),
        );
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
          });
        } else if (e.type === "tool_end") {
          markToolEnd(event.appId, e.toolName, e.isError);
        } else if (e.type === "error") {
          setFelixThinking((p) => ({ ...p, [event.appId]: false }));
          finishFelixTurn(event.appId, "error", `Oops, something went wrong. ${e.message}`);
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
        const last = list[list.length - 1];
        if (!last || last.role !== "felix") return prev;
        return { ...prev, [appId]: [...list.slice(0, -1), mutate(last)] };
      });
    },
    [],
  );

  const startFelixTurn = useCallback((appId: string) => {
    setChats((prev) => {
      const list = prev[appId] ?? [];
      const turn: ChatTurn = {
        id: newLiveTurnId("live"),
        role: "felix",
        text: "",
        steps: [],
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
        const last = list[list.length - 1];
        if (!last || last.role !== "felix") {
          if (status !== "error") return prev;
          const turn: ChatTurn = {
            id: newLiveTurnId("live-error"),
            role: "felix",
            text: fallbackText ?? "Oops, something went wrong.",
            steps: [],
            status,
            createdAt: new Date().toISOString(),
          };
          return { ...prev, [appId]: [...list, turn] };
        }
        const text = lastTextOf(last);
        const turn = {
          ...last,
          status,
          text: text.length > 0 ? text : (fallbackText ?? last.text),
        };
        return { ...prev, [appId]: [...list.slice(0, -1), turn] };
      });
    },
    [],
  );

  const openApp = useCallback(
    async (appId: string) => {
      setView({ name: "miniApp", appId });
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
    async (prompt: string) => {
      const summary = await felix.invoke("miniApp.create", { prompt });
      await refreshApps();
      setView({ name: "miniApp", appId: summary.id });
      setStatuses((prev) => ({
        ...prev,
        [summary.id]: { status: summary.status, devUrl: summary.devUrl },
      }));
      await felix.invoke("miniApp.open", { appId: summary.id });
      await felix.invoke("chat.send", { appId: summary.id, text: prompt });
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
      await refreshApps();
      setView({ name: "dashboard" });
    },
    [refreshApps],
  );

  const sendChat = useCallback(async (appId: string, text: string) => {
    await felix.invoke("chat.send", { appId, text });
  }, []);

  const abortChat = useCallback(async (appId: string) => {
    await felix.invoke("chat.abort", { appId });
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      view,
      apps,
      statuses,
      chats,
      felixThinking,
      goDashboard: () => setView({ name: "dashboard" }),
      goSettings: () => setView({ name: "settings" }),
      openApp,
      createApp,
      deleteApp,
      sendChat,
      abortChat,
    }),
    [view, apps, statuses, chats, felixThinking, openApp, createApp, deleteApp, sendChat, abortChat],
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
