import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  ChatTurn,
  type ChatAttachment,
  type ChatStep,
  type ChatTurnStatus,
} from "@felix/contracts";
import { newId } from "@felix/shared/ids";

export class ChatStore {
  private turns: ChatTurn[] | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly chatFile: string) {}

  async list(): Promise<ChatTurn[]> {
    if (this.turns) return structuredClone(this.turns);
    this.turns = await this.readTurns();
    return structuredClone(this.turns);
  }

  async clear(): Promise<void> {
    await this.writeAll([]);
  }

  private async readTurns(): Promise<ChatTurn[]> {
    try {
      const raw = await fs.readFile(this.chatFile, "utf8");
      return ChatTurn.array().parse(JSON.parse(raw));
    } catch (err) {
      if (isNodeError(err) && err.code === "ENOENT") return [];
      throw err;
    }
  }

  private async writeAll(turns: ChatTurn[]): Promise<void> {
    const nextTurns = structuredClone(turns);
    this.turns = nextTurns;
    const snapshot = structuredClone(nextTurns);
    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(() => this.writeFileAtomically(snapshot));
    await this.writeQueue;
  }

  private async writeFileAtomically(turns: ChatTurn[]): Promise<void> {
    await fs.mkdir(path.dirname(this.chatFile), { recursive: true });
    const tmp = path.join(
      path.dirname(this.chatFile),
      `.${path.basename(this.chatFile)}.${process.pid}.${Date.now()}.tmp`,
    );
    const handle = await fs.open(tmp, "w");
    try {
      await handle.writeFile(JSON.stringify(turns, null, 2), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.rename(tmp, this.chatFile);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  }

  async appendKidTurn(text: string, attachments: ChatAttachment[] = []): Promise<ChatTurn> {
    const turns = await this.mutableTurns();
    const turn = makeKidTurn(text, attachments);
    turns.push(turn);
    await this.writeAll(turns);
    return turn;
  }

  async appendSteeringKidTurn(
    text: string,
    attachments: ChatAttachment[] = [],
  ): Promise<{
    closedFelixTurn: ChatTurn | null;
    kidTurn: ChatTurn;
    felixTurn: ChatTurn;
  }> {
    const turns = await this.mutableTurns();
    const closedFelixTurn = closeActiveFelixTurn(turns);
    const kidTurn = makeKidTurn(text, attachments);
    const felixTurn = makeFelixTurn();

    turns.push(kidTurn, felixTurn);
    await this.writeAll(turns);

    return {
      closedFelixTurn: closedFelixTurn ? structuredClone(closedFelixTurn) : null,
      kidTurn,
      felixTurn,
    };
  }

  async startFelixTurn(): Promise<ChatTurn> {
    const turns = await this.mutableTurns();
    const activeFelixIndex = activeFelixTurnIndex(turns);
    if (activeFelixIndex !== -1) {
      const activeFelixTurn = moveTurnToEnd(turns, activeFelixIndex);
      await this.writeAll(turns);
      return activeFelixTurn;
    }

    const retryableFelixIndex = retryableFelixTurnIndex(turns);
    if (retryableFelixIndex !== -1) {
      const retryableFelixTurn = turns[retryableFelixIndex];
      if (!retryableFelixTurn) throw new Error("Retryable Felix turn not found");
      retryableFelixTurn.status = "working";
      retryableFelixTurn.text = lastTextOf(retryableFelixTurn);
      await this.writeAll(turns);
      return retryableFelixTurn;
    }

    const turn = makeFelixTurn();
    turns.push(turn);
    await this.writeAll(turns);
    return turn;
  }

  private async updateActiveFelixTurn(mutate: (turn: ChatTurn) => void): Promise<ChatTurn | null> {
    const turns = await this.mutableTurns();
    const index = activeFelixTurnIndex(turns);
    if (index === -1) return null;
    const turn = turns[index];
    if (!turn) return null;
    mutate(turn);
    await this.writeAll(turns);
    return turn;
  }

  async addStep(step: ChatStep): Promise<ChatTurn | null> {
    return this.updateActiveFelixTurn((turn) => {
      turn.steps.push(step);
    });
  }

  /** Appends text into the trailing text step, creating one if needed. */
  async appendText(delta: string): Promise<ChatTurn | null> {
    return this.updateActiveFelixTurn((turn) => {
      const last = turn.steps[turn.steps.length - 1];
      if (last && last.type === "text") {
        last.text += delta;
      } else {
        turn.steps.push({ type: "text", text: delta });
      }
      turn.text = lastTextOf(turn);
    });
  }

  async markToolEnd(toolName: string, isError: boolean): Promise<ChatTurn | null> {
    return this.updateActiveFelixTurn((turn) => {
      for (let i = turn.steps.length - 1; i >= 0; i -= 1) {
        const step = turn.steps[i];
        if (step?.type === "tool" && step.toolName === toolName && step.isError === undefined) {
          step.isError = isError;
          break;
        }
      }
    });
  }

  async finishTurn(status: ChatTurnStatus, fallbackText?: string): Promise<ChatTurn | null> {
    return this.updateActiveFelixTurn((turn) => {
      if (turn.status === "error" && status === "done") return;
      turn.status = status;
      const text = lastTextOf(turn);
      if (status === "error" && fallbackText) {
        turn.text = errorText(text.length > 0 ? text : turn.text, fallbackText);
      } else {
        turn.text = text.length > 0 ? text : (fallbackText ?? turn.text);
      }
    });
  }

  async recoverInterruptedTurns(fallbackText: string): Promise<ChatTurn[]> {
    const turns = await this.mutableTurns();
    const recovered: ChatTurn[] = [];
    let changed = false;

    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const turn = turns[i];
      if (!turn) continue;
      if (turn.role !== "felix" || turn.status !== "working") continue;
      if (isEmptyFelixTurn(turn) && previousTurnIsFelixError(turns, i)) {
        turns.splice(i, 1);
        changed = true;
        continue;
      }
      turn.status = "error";
      if (turn.text.trim().length === 0) {
        turn.text = fallbackText;
        turn.steps.push({ type: "text", text: fallbackText });
      }
      recovered.push(structuredClone(turn));
      changed = true;
    }

    if (changed) await this.writeAll(turns);
    return recovered;
  }

  async failFelixTurn(text: string): Promise<ChatTurn> {
    const updated = await this.finishTurn("error", text);
    if (updated) return updated;

    const turns = await this.mutableTurns();
    const last = turns[turns.length - 1];
    if (last?.role === "felix" && last.status === "error") {
      if (last.text.trim().length === 0) last.text = text;
      await this.writeAll(turns);
      return last;
    }

    const turn: ChatTurn = {
      id: newId("turn"),
      role: "felix",
      text,
      steps: [],
      attachments: [],
      status: "error",
      createdAt: new Date().toISOString(),
    };
    turns.push(turn);
    await this.writeAll(turns);
    return turn;
  }

  private async mutableTurns(): Promise<ChatTurn[]> {
    if (!this.turns) this.turns = await this.readTurns();
    return this.turns;
  }
}

function lastTextOf(turn: ChatTurn): string {
  for (let i = turn.steps.length - 1; i >= 0; i -= 1) {
    const step = turn.steps[i];
    if (step?.type === "text" && step.text.trim().length > 0) return step.text;
  }
  return "";
}

function makeKidTurn(text: string, attachments: ChatAttachment[]): ChatTurn {
  return {
    id: newId("turn"),
    role: "kid",
    text,
    steps: [],
    attachments,
    status: "done",
    createdAt: new Date().toISOString(),
  };
}

function makeFelixTurn(): ChatTurn {
  return {
    id: newId("turn"),
    role: "felix",
    text: "",
    steps: [],
    attachments: [],
    status: "working",
    createdAt: new Date().toISOString(),
  };
}

function closeActiveFelixTurn(turns: ChatTurn[]): ChatTurn | null {
  const activeIndex = activeFelixTurnIndex(turns);
  if (activeIndex === -1) return null;
  const turn = turns[activeIndex];
  if (!turn) return null;
  turn.status = "done";
  const text = lastTextOf(turn);
  turn.text = text.length > 0 ? text : turn.text;
  return turn;
}

function errorText(currentText: string, fallbackText: string): string {
  const current = currentText.trim();
  const fallback = fallbackText.trim();
  if (current.length === 0) return fallback;
  if (current.includes(fallback)) return currentText;
  return `${current}\n\n${fallback}`;
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

function isEmptyFelixTurn(turn: ChatTurn): boolean {
  return turn.text.trim().length === 0 && turn.steps.length === 0;
}

function previousTurnIsFelixError(turns: ChatTurn[], index: number): boolean {
  const previous = turns[index - 1];
  return previous?.role === "felix" && previous.status === "error";
}

function moveTurnToEnd(turns: ChatTurn[], index: number): ChatTurn {
  const turn = removeTurnAt(turns, index);
  turns.push(turn);
  return turn;
}

function removeTurnAt(turns: ChatTurn[], index: number): ChatTurn {
  const [turn] = turns.splice(index, 1);
  if (!turn) throw new Error(`Chat turn not found at index ${index}`);
  return turn;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
