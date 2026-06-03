import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Checkpoint } from "@felix/contracts";

const exec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, {
    cwd,
    maxBuffer: 1024 * 1024 * 16,
  });
  return stdout;
}

export async function initRepo(cwd: string): Promise<void> {
  await git(cwd, ["init", "--quiet"]);
  await git(cwd, ["config", "user.name", "Felix"]);
  await git(cwd, ["config", "user.email", "felix@felix.local"]);
  await git(cwd, ["config", "commit.gpgsign", "false"]);
}

export async function hasCommits(cwd: string): Promise<boolean> {
  try {
    await git(cwd, ["rev-parse", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

export async function checkpoint(
  cwd: string,
  message: string,
  author: Checkpoint["author"],
): Promise<string | null> {
  await git(cwd, ["add", "-A"]);
  const first = !(await hasCommits(cwd));
  if (!first) {
    const status = await git(cwd, ["status", "--porcelain"]);
    if (status.trim().length === 0) return null;
  }
  await git(cwd, [
    "-c",
    `user.name=${author}`,
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    message,
  ]);
  return (await git(cwd, ["rev-parse", "HEAD"])).trim();
}

export async function listCheckpoints(cwd: string): Promise<Checkpoint[]> {
  if (!(await hasCommits(cwd))) return [];
  const out = await git(cwd, [
    "log",
    "--pretty=format:%H%x1f%an%x1f%aI%x1f%s",
  ]);
  return out
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [id = "", author = "system", createdAt = "", message = ""] = line.split("\u001f");
      const normalizedAuthor: Checkpoint["author"] =
        author === "kid" || author === "felix" ? author : "system";
      return { id, message, createdAt, author: normalizedAuthor };
    });
}

export async function restoreCheckpoint(cwd: string, checkpointId: string): Promise<void> {
  if (!/^[0-9a-fA-F]{7,40}$/.test(checkpointId)) {
    throw new Error(`Invalid checkpoint id: ${checkpointId}`);
  }
  await git(cwd, ["reset", "--hard", checkpointId]);
}
