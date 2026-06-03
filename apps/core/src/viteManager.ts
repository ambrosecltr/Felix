import { type ChildProcess, spawn } from "node:child_process";
import * as net from "node:net";

const STOP_TIMEOUT_MS = 2_000;

interface RunningServer {
  process: ChildProcess;
  port: number;
  url: string;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not allocate port")));
      }
    });
  });
}

export class ViteManager {
  private servers = new Map<string, RunningServer>();

  constructor(private readonly nodeBin: string) {}

  isRunning(appId: string): boolean {
    return this.servers.has(appId);
  }

  getUrl(appId: string): string | null {
    return this.servers.get(appId)?.url ?? null;
  }

  async start(appId: string, cwd: string): Promise<{ url: string; port: number }> {
    const existing = this.servers.get(appId);
    if (existing) return { url: existing.url, port: existing.port };

    const port = await findFreePort();
    const child = spawn(
      this.nodeBin,
      [
        "node_modules/vite/bin/vite.js",
        "--port",
        String(port),
        "--host",
        "127.0.0.1",
        "--strictPort",
      ],
      { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } },
    );

    const url = `http://127.0.0.1:${port}/`;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Vite did not start in time")), 30_000);
      let stderr = "";
      const finish = (fn: () => void) => {
        clearTimeout(timeout);
        child.stdout?.off("data", onData);
        child.off("exit", onExit);
        fn();
      };
      const onData = (chunk: Buffer) => {
        const text = chunk.toString().toLowerCase();
        if (text.includes("ready") || text.includes("localhost") || text.includes("127.0.0.1")) {
          finish(resolve);
        }
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", (c: Buffer) => {
        stderr += c.toString();
      });
      const onExit = (code: number | null) => {
        finish(() => reject(new Error(`Vite exited early with code ${code}: ${stderr.slice(0, 300)}`)));
      };
      child.once("exit", onExit);
    });

    this.servers.set(appId, { process: child, port, url });
    child.once("exit", () => this.servers.delete(appId));
    return { url, port };
  }

  async stop(appId: string): Promise<void> {
    const server = this.servers.get(appId);
    if (!server) return;
    const stopped = waitForExit(server.process, STOP_TIMEOUT_MS);
    server.process.kill("SIGTERM");
    this.servers.delete(appId);
    await stopped;
  }

  stopAll(): void {
    for (const id of [...this.servers.keys()]) void this.stop(id);
  }
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      clearTimeout(killTimeout);
      child.off("exit", finish);
      resolve();
    };
    const killTimeout = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const timeout = setTimeout(finish, timeoutMs + 500);
    child.once("exit", finish);
    if (child.exitCode !== null || child.signalCode !== null) finish();
  });
}
