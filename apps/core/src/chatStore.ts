import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ChatTurn, type ChatStep, type ChatTurnStatus } from "@felix/contracts";
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

  async appendKidTurn(text: string): Promise<ChatTurn> {
    const turns = await this.mutableTurns();
    const turn: ChatTurn = {
      id: newId("turn"),
      role: "kid",
      text,
      steps: [],
      status: "done",
      createdAt: new Date().toISOString(),
    };
    turns.push(turn);
    await this.writeAll(turns);
    return turn;
  }

  async startFelixTurn(): Promise<ChatTurn> {
    const turns = await this.mutableTurns();
    const turn: ChatTurn = {
      id: newId("turn"),
      role: "felix",
      text: "",
      steps: [],
      status: "working",
      createdAt: new Date().toISOString(),
    };
    turns.push(turn);
    await this.writeAll(turns);
    return turn;
  }

  private async updateLastTurn(mutate: (turn: ChatTurn) => void): Promise<ChatTurn | null> {
    const turns = await this.mutableTurns();
    const last = turns[turns.length - 1];
    if (!last || last.role !== "felix") return null;
    mutate(last);
    await this.writeAll(turns);
    return last;
  }

  async addStep(step: ChatStep): Promise<ChatTurn | null> {
    return this.updateLastTurn((turn) => {
      turn.steps.push(step);
    });
  }

  /** Appends text into the trailing text step, creating one if needed. */
  async appendText(delta: string): Promise<ChatTurn | null> {
    return this.updateLastTurn((turn) => {
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
    return this.updateLastTurn((turn) => {
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
    return this.updateLastTurn((turn) => {
      turn.status = status;
      const text = lastTextOf(turn);
      turn.text = text.length > 0 ? text : (fallbackText ?? turn.text);
    });
  }

  async failFelixTurn(text: string): Promise<ChatTurn> {
    const updated = await this.finishTurn("error", text);
    if (updated) return updated;

    const turns = await this.mutableTurns();
    const turn: ChatTurn = {
      id: newId("turn"),
      role: "felix",
      text,
      steps: [],
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

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
