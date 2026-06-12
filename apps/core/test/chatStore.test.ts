import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ChatStore } from "../src/chatStore.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createStore(): Promise<ChatStore> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-chat-store-"));
  tempDirs.push(dir);
  return new ChatStore(path.join(dir, "chat.json"));
}

describe("ChatStore", () => {
  test("splits the visible Felix turn when a kid steers mid-response", async () => {
    const store = await createStore();

    await store.appendKidTurn("Make a space game");
    await store.startFelixTurn();
    await store.appendText("Building ");
    const { closedFelixTurn, kidTurn, felixTurn } = await store.appendSteeringKidTurn(
      "Make the stars gold",
    );
    await store.appendText("gold stars.");
    await store.finishTurn("done");

    const turns = await store.list();
    expect(closedFelixTurn?.status).toBe("done");
    expect(kidTurn.text).toBe("Make the stars gold");
    expect(felixTurn.status).toBe("working");
    expect(turns.map((turn) => turn.role)).toEqual(["kid", "felix", "kid", "felix"]);
    expect(turns[1]?.status).toBe("done");
    expect(turns[1]?.text).toBe("Building ");
    expect(turns[3]?.status).toBe("done");
    expect(turns[3]?.text).toBe("gold stars.");
  });

  test("reuses an existing working Felix turn on duplicate agent_start", async () => {
    const store = await createStore();

    await store.startFelixTurn();
    await store.appendText("Still working");
    await store.startFelixTurn();

    const turns = await store.list();
    expect(turns).toHaveLength(1);
    expect(turns[0]?.role).toBe("felix");
    expect(turns[0]?.status).toBe("working");
    expect(turns[0]?.text).toBe("Still working");
  });

  test("reopens an errored Felix turn when the same run starts again", async () => {
    const store = await createStore();

    await store.startFelixTurn();
    await store.appendText("I'll build the game now.");
    await store.failFelixTurn("Oops, something went wrong. Upstream idle timeout exceeded");
    await store.startFelixTurn();

    const turns = await store.list();
    expect(turns).toHaveLength(1);
    expect(turns[0]?.role).toBe("felix");
    expect(turns[0]?.status).toBe("working");
    expect(turns[0]?.text).toBe("I'll build the game now.");
  });

  test("recovers stale working turns left by an interrupted process", async () => {
    const store = await createStore();
    const fallback = "Felix was interrupted before it could finish.";

    await store.appendKidTurn("Add a timer");
    await store.startFelixTurn();

    const recovered = await store.recoverInterruptedTurns(fallback);
    const turns = await store.list();

    expect(recovered).toHaveLength(1);
    expect(turns[1]?.role).toBe("felix");
    expect(turns[1]?.status).toBe("error");
    expect(turns[1]?.text).toBe(fallback);
  });

  test("removes stale blank working turns after an errored Felix turn", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-chat-store-"));
    tempDirs.push(dir);
    const chatFile = path.join(dir, "chat.json");
    await fs.writeFile(
      chatFile,
      JSON.stringify([
        {
          id: "turn-error",
          role: "felix",
          text: "Oops, something went wrong. Upstream idle timeout exceeded",
          steps: [],
          attachments: [],
          status: "error",
          createdAt: "2026-06-12T04:49:16.000Z",
        },
        {
          id: "turn-empty-working",
          role: "felix",
          text: "",
          steps: [],
          attachments: [],
          status: "working",
          createdAt: "2026-06-12T04:49:18.000Z",
        },
      ]),
      "utf8",
    );
    const store = new ChatStore(chatFile);

    const recovered = await store.recoverInterruptedTurns(
      "Felix was interrupted before it could finish.",
    );
    const turns = await store.list();

    expect(recovered).toHaveLength(0);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.id).toBe("turn-error");
    expect(turns[0]?.status).toBe("error");
  });

  test("keeps partial assistant text visible while also showing final errors", async () => {
    const store = await createStore();

    await store.startFelixTurn();
    await store.appendText("I'll build the game now.");
    await store.failFelixTurn("Oops, something went wrong. Upstream idle timeout exceeded");

    const turns = await store.list();
    expect(turns[0]?.status).toBe("error");
    expect(turns[0]?.text).toBe(
      "I'll build the game now.\n\nOops, something went wrong. Upstream idle timeout exceeded",
    );
  });
});
