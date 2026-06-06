import { useEffect, useRef, useState } from "react";
import type { ChatStep, ChatTurn, ExtensionUiResponse } from "@felix/contracts";
import { filesToChatAttachments } from "../lib/message-attachments.ts";
import { type IconName, useIcon } from "../lib/icon-context.tsx";
import { type UiRequest, useStore } from "../store.tsx";
import { Markdown } from "./Markdown.tsx";
import { AskUserQuestions, type AskUserAnswer } from "./ui/ask-user-questions.tsx";
import { Button } from "./ui/Button.tsx";
import { ChatMessage } from "./ui/chat-message.tsx";
import { InputMessage } from "./ui/input-message.tsx";
import {
  ThinkingStep,
  ThinkingStepDetails,
  ThinkingSteps,
  ThinkingStepsContent,
  ThinkingStepsHeader,
} from "./ui/thinking-steps.tsx";

export function BuildChat({ appId }: { appId: string }) {
  const {
    chats,
    felixThinking,
    uiRequests,
    clearChat,
    sendChat,
    abortChat,
    respondToUiRequest,
  } = useStore();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const turns = chats[appId] ?? [];
  const thinking = felixThinking[appId] ?? false;
  const activeRequest = uiRequests[appId]?.[0];
  const scrollRef = useRef<HTMLDivElement>(null);
  const PaperclipIcon = useIcon("paperclip");
  const TrashIcon = useIcon("trash");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, thinking, activeRequest]);

  const submit = async (value: string, attachedFiles: File[]) => {
    const trimmed = value.trim();
    if (trimmed.length === 0 && attachedFiles.length === 0) return;

    try {
      const attachments = await filesToChatAttachments(attachedFiles);
      setText("");
      setFiles([]);
      setError(null);
      await sendChat(appId, trimmed, attachments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't attach those files.");
    }
  };

  const clearCurrentChat = async () => {
    setIsClearing(true);
    setError(null);
    try {
      await clearChat(appId);
      setText("");
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't clear this chat.");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-10 items-center justify-between gap-2 border-b border-border px-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Build with Felix
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          leadingIcon={TrashIcon}
          loading={isClearing}
          disabled={turns.length === 0 && !thinking && !activeRequest}
          onClick={() => void clearCurrentChat()}
        >
          Clear chat
        </Button>
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <div className="flex min-h-full items-center justify-center text-center">
            <div className="max-w-[240px]">
              <p className="text-sm font-medium text-foreground">Start a fresh chat</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Tell Felix what to change and watch your app update.
              </p>
            </div>
          </div>
        ) : (
          turns.map((turn) => <TurnView key={turn.id} turn={turn} />)
        )}
      </div>

      <div className="border-t border-border p-3">
        {activeRequest && (
          <QuestionRequest
            request={activeRequest}
            onRespond={(response) => void respondToUiRequest(appId, response)}
          />
        )}
        {error && (
          <p className="mb-2 px-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <InputMessage
          value={text}
          onValueChange={setText}
          onSend={(value, nextFiles) => void submit(value, nextFiles)}
          placeholder="Make the stars gold..."
          minRows={2}
          maxRows={8}
          sendLabel="Send"
          files={files}
          onFilesChange={setFiles}
          maxFiles={4}
          leftSlot={({ openFilePicker }) => (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Attach files"
              title="Attach files"
              onClick={() => openFilePicker()}
            >
              <PaperclipIcon />
            </Button>
          )}
          rightSlot={
            thinking ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => void abortChat(appId)}>
                Stop
              </Button>
            ) : null
          }
        />
      </div>
    </div>
  );
}

function QuestionRequest({
  request,
  onRespond,
}: {
  request: UiRequest;
  onRespond: (response: ExtensionUiResponse) => void;
}) {
  const [customValue, setCustomValue] = useState(request.prefill ?? "");
  const title = questionTitle(request);

  if (request.method === "confirm") {
    return (
      <AskUserQuestions
        className="mb-3 max-w-full"
        questions={[
          {
            id: request.id,
            title,
            skippable: false,
            options: [
              { id: "yes", title: "Yes" },
              { id: "no", title: "No" },
            ],
          },
        ]}
        onComplete={(answers) => {
          const answer = answers[request.id];
          onRespond({ id: request.id, confirmed: answer?.selectedIds[0] === "yes" });
        }}
      />
    );
  }

  if (request.method === "select" && request.options && request.options.length > 0) {
    return (
      <AskUserQuestions
        className="mb-3 max-w-full"
        questions={[
          {
            id: request.id,
            title,
            options: request.options.map((option) => ({ id: option, title: option })),
          },
        ]}
        onComplete={(answers) => {
          const answer = answers[request.id];
          onRespond(answerToResponse(request.id, answer));
        }}
      />
    );
  }

  return (
    <div className="mb-3 rounded-3xl bg-surface-2 p-3 shadow-surface-2">
      <div className="mb-2 px-1">
        <p className="text-sm font-semibold text-foreground">{request.title ?? "Felix has a question"}</p>
        {(request.message ?? request.placeholder) && (
          <p className="mt-0.5 text-xs text-muted-foreground">{request.message ?? request.placeholder}</p>
        )}
      </div>
      <InputMessage
        value={customValue}
        onValueChange={setCustomValue}
        onSend={(value) => {
          const trimmed = value.trim();
          if (trimmed.length > 0) onRespond({ id: request.id, value: trimmed });
        }}
        placeholder={request.placeholder ?? "Type your answer..."}
        minRows={request.method === "editor" ? 4 : 2}
        maxRows={request.method === "editor" ? 10 : 5}
        sendLabel="Answer"
        rightSlot={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRespond({ id: request.id, cancelled: true })}
          >
            Skip
          </Button>
        }
      />
    </div>
  );
}

function questionTitle(request: UiRequest): string {
  const title = request.title ?? "Felix has a question";
  const detail = request.message ?? request.placeholder;
  return detail ? `${title}: ${detail}` : title;
}

function answerToResponse(id: string, answer: AskUserAnswer | undefined): ExtensionUiResponse {
  if (!answer || answer.skipped) return { id, cancelled: true };
  const value = answer.otherText?.trim() || answer.selectedIds[0];
  return value ? { id, value } : { id, cancelled: true };
}

function TurnView({ turn }: { turn: ChatTurn }) {
  if (turn.role === "kid") {
    return (
      <ChatMessage from="user">
        <div className="flex flex-col gap-2">
          {turn.text && <Markdown text={turn.text} />}
          <AttachmentList attachments={turn.attachments} />
        </div>
      </ChatMessage>
    );
  }
  return <FelixTurn turn={turn} />;
}

function AttachmentList({ attachments }: { attachments: ChatTurn["attachments"] }) {
  const PaperclipIcon = useIcon("paperclip");
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex min-w-0 items-center gap-2 rounded-2xl bg-background/55 px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          <PaperclipIcon size={14} />
          <span className="min-w-0 truncate">{attachment.name}</span>
          <span className="shrink-0">{formatAttachmentSize(attachment.size)}</span>
        </div>
      ))}
    </div>
  );
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

function FelixTurn({ turn }: { turn: ChatTurn }) {
  const working = turn.status === "working";
  return (
    <ChatMessage from="assistant" className="max-w-full">
      {working ? <WorkingSteps turn={turn} /> : <CompletedWork turn={turn} />}
    </ChatMessage>
  );
}

function WorkingSteps({ turn }: { turn: ChatTurn }) {
  const items = buildThinkingItems(turn, true);

  return (
    <div className="flex w-full flex-col">
      <ThinkingSteps className="w-full max-w-full">
        <ThinkingStepsHeader />
        <ThinkingStepsContent>
          {items.map((item, index) => renderThinkingItem(item, index, index === items.length - 1))}
        </ThinkingStepsContent>
      </ThinkingSteps>
    </div>
  );
}

function CompletedWork({ turn }: { turn: ChatTurn }) {
  const items = buildThinkingItems(turn, false);
  const hasSteps = items.length > 0;
  const fallbackText =
    turn.status === "error"
      ? "Felix hit an error before returning details."
      : "Felix finished without returning a message.";
  const responseText = turn.text.trim().length > 0 ? turn.text : fallbackText;

  return (
    <div className="flex w-full flex-col gap-2">
      {hasSteps && (
        <ThinkingSteps defaultOpen={false} className="w-full max-w-full">
          <ThinkingStepsHeader>
            Felix worked on it ({items.length} {items.length === 1 ? "step" : "steps"})
          </ThinkingStepsHeader>
          <ThinkingStepsContent>
            {items.map((item, index) => renderThinkingItem(item, index, index === items.length - 1))}
          </ThinkingStepsContent>
        </ThinkingSteps>
      )}
      <Markdown text={responseText} />
    </div>
  );
}

type ToolStep = Extract<ChatStep, { type: "tool" }>;
type ToolKind = "read" | "write" | "run" | "search" | "other";
type ThinkingItemStatus = "complete" | "active";

interface ToolGroupItem {
  type: "tool";
  key: string;
  label: string;
  kind: ToolKind;
  count: number;
  details: string[];
  hasError: boolean;
  status: ThinkingItemStatus;
}

interface TextThinkingItem {
  type: "text";
  text: string;
  status: ThinkingItemStatus;
}

interface ActivityThinkingItem {
  type: "activity";
  label: string;
  icon: IconName;
  status: "active";
}

type ThinkingItem = ToolGroupItem | TextThinkingItem | ActivityThinkingItem;

function buildThinkingItems(turn: ChatTurn, includeText: boolean): ThinkingItem[] {
  const items: ThinkingItem[] = [];
  turn.steps.forEach((step, stepIndex) => {
    if (step.type === "tool") {
      appendToolGroup(items, step);
      return;
    }

    const text = step.text.trim();
    if (includeText && text.length > 0) {
      items.push({
        type: "text",
        text,
        status: stepIndex === turn.steps.length - 1 && turn.status === "working" ? "active" : "complete",
      });
    }
  });

  if (turn.status === "working" && !lastItemIsActive(items)) {
    items.push({
      type: "activity",
      label: pendingActivityLabel(turn.steps),
      icon: "brain",
      status: "active",
    });
  }

  return items;
}

function appendToolGroup(items: ThinkingItem[], step: ToolStep): void {
  const label = cleanToolLabel(step.label);
  const key = label.toLowerCase();
  const kind = toolKind(step);
  const last = items[items.length - 1];

  if (last?.type === "tool" && canGroupToolStep(last, step, key)) {
    last.count += 1;
    last.hasError = last.hasError || step.isError === true;
    last.status = step.isError === undefined ? "active" : last.status;
    const detail = cleanOptionalText(step.detail);
    if (detail) last.details.push(detail);
    return;
  }

  const detail = cleanOptionalText(step.detail);
  items.push({
    type: "tool",
    key,
    label,
    kind,
    count: 1,
    details: detail ? [detail] : [],
    hasError: step.isError === true,
    status: step.isError === undefined ? "active" : "complete",
  });
}

function canGroupToolStep(group: ToolGroupItem, step: ToolStep, key: string): boolean {
  if (group.key !== key) return false;
  const stepHasError = step.isError === true;
  if (group.hasError || stepHasError) return group.hasError === stepHasError;
  return true;
}

function renderThinkingItem(item: ThinkingItem, index: number, isLast: boolean) {
  if (item.type === "text") {
    return (
      <ThinkingStep
        key={`text-${index}`}
        index={index}
        label={item.status === "active" ? "Responding" : "Response"}
        description={item.text}
        icon="message-circle"
        status={item.status}
        isLast={isLast}
      />
    );
  }

  if (item.type === "activity") {
    return (
      <ThinkingStep
        key={`activity-${index}`}
        index={index}
        label={item.label}
        icon={item.icon}
        status={item.status}
        isLast={isLast}
      />
    );
  }

  const detailsSummary = item.count > 1 && item.details.length > 0 ? groupedDetailsSummary(item) : null;
  return (
    <ThinkingStep
      key={`tool-${item.key}-${index}`}
      index={index}
      label={groupedToolLabel(item)}
      description={item.count === 1 ? item.details[0] : undefined}
      icon={item.hasError ? "x" : toolIcon(item.kind)}
      status={item.status}
      isLast={isLast}
    >
      {detailsSummary && (
        <ThinkingStepDetails
          summary={detailsSummary}
          details={item.details}
        />
      )}
    </ThinkingStep>
  );
}

function lastItemIsActive(items: ThinkingItem[]): boolean {
  const last = items[items.length - 1];
  return last?.status === "active";
}

function cleanToolLabel(label: string): string {
  return label.replace(/[.…\s]+$/u, "").trim() || "Working";
}

function cleanOptionalText(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text && text.length > 0 ? text : undefined;
}

function toolKind(step: ToolStep): ToolKind {
  const name = step.toolName.toLowerCase();
  const label = step.label.toLowerCase();
  if (name.includes("read") || name === "cat" || label.includes("reading")) return "read";
  if (name.includes("write") || name.includes("edit") || name.includes("patch") || label.includes("writing")) return "write";
  if (name.includes("bash") || name.includes("shell") || name.includes("run") || name.includes("exec")) return "run";
  if (name.includes("list") || name.includes("glob") || name.includes("grep") || name.includes("search") || name.includes("find")) return "search";
  return "other";
}

function toolIcon(kind: ToolKind): IconName {
  if (kind === "read") return "search";
  if (kind === "write") return "pencil";
  if (kind === "run") return "play";
  if (kind === "search") return "globe";
  return "settings";
}

function groupedToolLabel(group: ToolGroupItem): string {
  if (group.count === 1) return group.label;
  if (group.kind === "read") return `Read ${group.count} files`;
  if (group.kind === "write") return `Updated ${group.count} files`;
  if (group.kind === "run") return `Ran ${group.count} commands`;
  if (group.kind === "search") return `Explored ${group.count} places`;
  return `${group.label} (${group.count})`;
}

function groupedDetailsSummary(group: ToolGroupItem): string {
  if (group.kind === "read") return `Explored ${group.count} files`;
  if (group.kind === "write") return `Touched ${group.count} files`;
  if (group.kind === "run") return `Ran ${group.count} commands`;
  if (group.kind === "search") return `Checked ${group.count} places`;
  return `Show ${group.count} tool calls`;
}

function pendingActivityLabel(steps: ChatStep[]): string {
  const last = steps[steps.length - 1];
  if (!last) return "Thinking";
  if (last.type === "tool" && last.isError !== undefined) return "Planning next step";
  return "Thinking";
}
