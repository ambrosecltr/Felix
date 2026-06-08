import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  BrowserPreviewBridgeServer,
  type BrowserPreviewToolRequest,
} from "../src/browserPreview.ts";

describe("BrowserPreviewBridgeServer", () => {
  test("dispatches file-backed preview requests and writes responses", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-browser-preview-"));
    const requests: BrowserPreviewToolRequest[] = [];
    const inactiveApps: string[] = [];
    const server = new BrowserPreviewBridgeServer("app-1", dir, {
      async execute(_appId, request) {
        requests.push(request);
        return {
          content: [{ type: "text", text: `handled ${request.toolName}` }],
          details: { ok: true },
        };
      },
      setAgentActive(appId, active) {
        if (!active) inactiveApps.push(appId);
      },
    });

    try {
      await server.start();
      await fs.writeFile(
        path.join(dir, "req-1.request.json"),
        JSON.stringify({
          id: "req-1",
          toolName: "browser_snapshot",
          params: { limit: 2 },
        }),
        "utf8",
      );

      const response = await readResponse(path.join(dir, "req-1.response.json"));
      expect(response).toEqual({
        id: "req-1",
        result: {
          content: [{ type: "text", text: "handled browser_snapshot" }],
          details: { ok: true },
        },
      });
      expect(requests).toEqual([{ toolName: "browser_snapshot", params: { limit: 2 } }]);
    } finally {
      server.dispose();
      await fs.rm(dir, { recursive: true, force: true });
    }

    expect(inactiveApps).toContain("app-1");
  });

  test("does not reject in-flight request processing after dispose", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-browser-preview-"));
    let resolveExecuteStarted = () => {};
    let releaseExecute: (() => void) | null = null;
    const executeStarted = new Promise<void>((resolve) => {
      resolveExecuteStarted = resolve;
    });
    const unhandled: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandled.push(reason);
    };
    const server = new BrowserPreviewBridgeServer("app-1", dir, {
      async execute() {
        resolveExecuteStarted();
        await new Promise<void>((resolve) => {
          releaseExecute = resolve;
        });
        return { content: [{ type: "text", text: "too late" }] };
      },
    });

    process.on("unhandledRejection", onUnhandledRejection);
    try {
      await server.start();
      await fs.writeFile(
        path.join(dir, "req-1.request.json"),
        JSON.stringify({
          id: "req-1",
          toolName: "browser_snapshot",
          params: {},
        }),
        "utf8",
      );
      await executeStarted;
      server.dispose();
      expect(releaseExecute).not.toBeNull();
      releaseExecute?.();
      await sleep(50);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
      server.dispose();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

async function readResponse(filePath: string): Promise<unknown> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
    await sleep(20);
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
