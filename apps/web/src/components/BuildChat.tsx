import { type ReactNode, useEffect, useRef, useState } from "react";
import type { ChatStep, ChatTurn } from "@felix/contracts";
import { type UiRequest, useStore } from "../store.tsx";
import { Button } from "./ui/Button.tsx";
import { Loader } from "./Loader.tsx";
import { Markdown } from "./Markdown.tsx";

export function BuildChat({ appId }: { appId: string }) {
  const { chats, felixThinking, uiRequests, sendChat, abortChat, respondToUiRequest } = useStore();
  const [text, setText] = useState("");
  const turns = chats[appId] ?? [];
  const thinking = felixThinking[appId] ?? false;
  const activeRequest = uiRequests[appId]?.[0];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, thinking]);

  const submit = async () => {
    const value = text.trim();
    if (value.length === 0) return;
    setText("");
    await sendChat(appId, value);
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-10 items-center border-b border-border px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Build with Felix
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {turns.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Tell Felix what to change and watch your app update.
          </p>
        )}
        {turns.map((turn) => (
          <TurnView key={turn.id} turn={turn} />
        ))}
      </div>

      <div className="border-t border-border p-3">
        {activeRequest && (
          <QuestionRequest
            request={activeRequest}
            onRespond={(response) => void respondToUiRequest(appId, response)}
          />
        )}
        <div className="rounded-lg border border-border bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring/40">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
            placeholder="Make the stars gold…"
            className="w-full resize-none bg-transparent px-3 pt-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            {thinking ? (
              <Button variant="ghost" size="sm" onClick={() => void abortChat(appId)}>
                Stop
              </Button>
            ) : (
              <span />
            )}
            <Button size="sm" onClick={() => void submit()} disabled={text.trim().length === 0}>
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionRequest({
  request,
  onRespond,
}: {
  request: UiRequest;
  onRespond: (response: { id: string; value?: string; confirmed?: boolean; cancelled?: boolean }) => void;
}) {
  const [customValue, setCustomValue] = useState(request.prefill ?? "");
  const title = request.title ?? "Felix has a question";
  const detail = request.message ?? request.placeholder;

  if (request.method === "confirm") {
    return (
      <QuestionShell title={title} detail={detail}>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onRespond({ id: request.id, confirmed: true })}>
            Yes
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRespond({ id: request.id, confirmed: false })}
          >
            No
          </Button>
        </div>
      </QuestionShell>
    );
  }

  if (request.method === "select" && request.options && request.options.length > 0) {
    return (
      <QuestionShell title={title} detail={detail}>
        <div className="grid gap-2 sm:grid-cols-2">
          {request.options.map((option) => (
            <Button
              key={option}
              variant="secondary"
              size="sm"
              className="h-auto justify-start whitespace-normal px-3 py-2 text-left"
              onClick={() => onRespond({ id: request.id, value: option })}
            >
              {option}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => onRespond({ id: request.id, cancelled: true })}
        >
          Skip
        </Button>
      </QuestionShell>
    );
  }

  return (
    <QuestionShell title={title} detail={detail}>
      <textarea
        value={customValue}
        onChange={(e) => setCustomValue(e.target.value)}
        rows={request.method === "editor" ? 4 : 2}
        className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        placeholder={request.placeholder ?? "Type your answer…"}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRespond({ id: request.id, cancelled: true })}
        >
          Skip
        </Button>
        <Button
          size="sm"
          onClick={() => onRespond({ id: request.id, value: customValue.trim() })}
          disabled={customValue.trim().length === 0}
        >
          Answer
        </Button>
      </div>
    </QuestionShell>
  );
}

function QuestionShell({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 rounded-lg border border-primary/25 bg-primary/5 p-3 shadow-sm">
      <div className="mb-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      </div>
      {children}
    </div>
  );
}

function TurnView({ turn }: { turn: ChatTurn }) {
  if (turn.role === "kid") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          {turn.text || "…"}
        </div>
      </div>
    );
  }
  return <FelixTurn turn={turn} />;
}

function FelixTurn({ turn }: { turn: ChatTurn }) {
  const working = turn.status === "working";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Felix</span>
      {working ? <WorkingSteps turn={turn} /> : <CompletedWork turn={turn} />}
    </div>
  );
}

function stepText(step: ChatStep): string {
  return step.type === "text" ? step.text : step.label;
}

/** Picks the live status label from the most recent step. */
function phaseLabel(turn: ChatTurn): string {
  const last = turn.steps[turn.steps.length - 1];
  if (!last) return "Thinking…";
  if (last.type === "tool" && last.isError === undefined) return "Working…";
  if (last.type === "text" && last.text.length > 0) return "Typing…";
  return "Thinking…";
}

function WorkingSteps({ turn }: { turn: ChatTurn }) {
  // While working, show the live trail: tool actions plus any streaming text.
  return (
    <div className="flex flex-col gap-2">
      {turn.steps.map((step, i) =>
        step.type === "text" ? (
          step.text.trim().length > 0 && <Markdown key={i} text={step.text} />
        ) : (
          <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
            {step.isError === undefined ? (
              <Loader className="size-3.5 text-primary" />
            ) : (
              <span className={step.isError ? "text-destructive" : "text-success"}>
                {step.isError ? "✕" : "✓"}
              </span>
            )}
            <span>{step.label}</span>
          </div>
        ),
      )}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader className="size-3.5 text-primary" />
        <span>{phaseLabel(turn)}</span>
      </div>
    </div>
  );
}

function CompletedWork({ turn }: { turn: ChatTurn }) {
  const [open, setOpen] = useState(false);
  const stepCount = turn.steps.filter((s) => s.type === "tool" || stepText(s).trim().length > 0).length;
  const hasSteps = stepCount > 1 || turn.steps.some((s) => s.type === "tool");

  return (
    <div className="flex flex-col gap-2">
      {hasSteps && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-fit items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          Felix worked on it ({stepCount} {stepCount === 1 ? "step" : "steps"})
        </button>
      )}
      {open && (
        <div className="flex flex-col gap-1.5 border-l border-border pl-3">
          {turn.steps.map((step, i) =>
            step.type === "tool" ? (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={step.isError ? "text-destructive" : "text-success"}>
                  {step.isError ? "✕" : "✓"}
                </span>
                {step.label}
              </div>
            ) : (
              step.text.trim().length > 0 && (
                <div key={i} className="text-xs text-muted-foreground">
                  <Markdown text={step.text} />
                </div>
              )
            ),
          )}
        </div>
      )}
      <Markdown text={turn.text || "All done!"} />
    </div>
  );
}
