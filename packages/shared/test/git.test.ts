import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as checkpoints from "../src/git.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("git checkpoints", () => {
  test("creates a first checkpoint and skips unchanged snapshots", async () => {
    const dir = await tempRepo();
    await writeFile(dir, ".gitignore", "node_modules/\nfelix.db\n");
    await writeFile(dir, "app.txt", "first");

    await checkpoints.initRepo(dir);
    const first = await checkpoints.checkpoint(dir, "First version", "system");
    const unchanged = await checkpoints.checkpoint(dir, "No changes", "kid");

    expect(first).toMatch(/^[0-9a-f]{40}$/);
    expect(unchanged).toBeNull();
    expect(await checkpoints.listCheckpoints(dir)).toEqual([
      {
        id: first,
        message: "First version",
        createdAt: expect.any(String),
        author: "system",
      },
    ]);
  });

  test("ignores Felix atomic-write temp files in snapshots", async () => {
    const dir = await tempRepo();
    await writeFile(dir, "app.txt", "first");
    await writeFile(dir, ".felix/.chat.json.123.456.tmp", "temporary");

    await checkpoints.initRepo(dir);
    const first = await checkpoints.checkpoint(dir, "First version", "system");
    await fs.rm(path.join(dir, ".felix/.chat.json.123.456.tmp"));
    const unchanged = await checkpoints.checkpoint(dir, "No changes", "kid");

    expect(first).toMatch(/^[0-9a-f]{40}$/);
    expect(unchanged).toBeNull();
  });

  test("restores tracked changes while preserving ignored local data", async () => {
    const dir = await tempRepo();
    await writeFile(dir, ".gitignore", "node_modules/\nfelix.db\n");
    await writeFile(dir, "app.txt", "one");
    await writeFile(dir, "src/nested.txt", "nested one");
    const first = await checkpoints.checkpoint(dir, "One", "system");
    if (!first) throw new Error("Expected first checkpoint");

    await writeFile(dir, "app.txt", "two");
    await writeFile(dir, "src/nested.txt", "nested two");
    await writeFile(dir, "new.txt", "new");
    await writeFile(dir, "felix.db", "local db");
    await writeFile(dir, "node_modules/pkg/index.js", "ignored");
    const second = await checkpoints.checkpoint(dir, "Two", "kid");
    if (!second) throw new Error("Expected second checkpoint");

    await fs.rm(path.join(dir, "app.txt"));
    await checkpoints.restoreCheckpoint(dir, first.slice(0, 7));

    expect(await fs.readFile(path.join(dir, "app.txt"), "utf8")).toBe("one");
    expect(await fs.readFile(path.join(dir, "src/nested.txt"), "utf8")).toBe("nested one");
    await expectFileMissing(path.join(dir, "new.txt"));
    expect(await fs.readFile(path.join(dir, "felix.db"), "utf8")).toBe("local db");
    expect(await fs.readFile(path.join(dir, "node_modules/pkg/index.js"), "utf8")).toBe("ignored");
  });

  test("retains only the latest three checkpoints and prunes old loose objects", async () => {
    const dir = await tempRepo();
    await writeFile(dir, ".gitignore", "node_modules/\n");
    const ids: string[] = [];

    for (let index = 0; index < 5; index += 1) {
      await writeFile(dir, "app.txt", String(index));
      const id = await checkpoints.checkpoint(dir, `Version ${index}`, "kid");
      if (!id) throw new Error(`Expected checkpoint ${index}`);
      ids.push(id);
    }

    expect((await checkpoints.listCheckpoints(dir)).map((checkpoint) => checkpoint.id)).toEqual(
      ids.slice(-3).reverse(),
    );
    await expect(checkpoints.restoreCheckpoint(dir, ids[1])).rejects.toThrow("Checkpoint not found");
    await expectFileMissing(looseObjectPath(dir, ids[0]));
  });

  test("rejects invalid checkpoint ids", async () => {
    const dir = await tempRepo();
    await writeFile(dir, "app.txt", "one");
    await checkpoints.checkpoint(dir, "One", "system");

    await expect(checkpoints.restoreCheckpoint(dir, "../bad")).rejects.toThrow(
      "Invalid checkpoint id",
    );
  });
});

async function tempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "felix-git-"));
  tempDirs.push(dir);
  return dir;
}

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  const file = path.join(root, relativePath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");
}

async function expectFileMissing(file: string): Promise<void> {
  await expect(fs.access(file)).rejects.toThrow();
}

function looseObjectPath(root: string, oid: string): string {
  return path.join(root, ".git", "objects", oid.slice(0, 2), oid.slice(2));
}
