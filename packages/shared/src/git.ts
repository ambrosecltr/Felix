import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { Checkpoint } from "@felix/contracts";
import * as isoGit from "isomorphic-git";
import type { ReadCommitResult } from "isomorphic-git";

const CHECKPOINT_BRANCH = "main";
const CHECKPOINT_BRANCH_REF = `refs/heads/${CHECKPOINT_BRANCH}`;
const CHECKPOINT_REFS_DIR = "refs/felix/checkpoints";
const MAX_RETAINED_CHECKPOINTS = 3;
const OBJECT_DIR_RE = /^[0-9a-f]{2}$/;
const OBJECT_FILE_RE = /^[0-9a-f]{38}$/;
const COMMIT_ID_RE = /^[0-9a-fA-F]{7,40}$/;

let lastCheckpointRefTime = 0;

export async function initRepo(cwd: string): Promise<void> {
  await ensureRepo(cwd);
}

export async function hasCommits(cwd: string): Promise<boolean> {
  try {
    await isoGit.resolveRef({ fs, dir: cwd, ref: "HEAD" });
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
  await ensureRepo(cwd);
  const changed = await stageWorktreeSnapshot(cwd);
  if (!changed && (await hasCommits(cwd))) return null;

  const oid = await isoGit.commit({
    fs,
    dir: cwd,
    ref: CHECKPOINT_BRANCH_REF,
    message,
    author: identity(author),
    committer: identity("Felix"),
    parent: [],
  });

  await isoGit.writeRef({
    fs,
    dir: cwd,
    ref: checkpointRef(nextCheckpointRefTime(), oid),
    value: oid,
    force: true,
  });
  await pruneCheckpoints(cwd);
  return oid;
}

export async function listCheckpoints(cwd: string): Promise<Checkpoint[]> {
  const records = await checkpointRecords(cwd);
  if (records.length > 0) {
    return records
      .sort(compareCheckpointRecords)
      .slice(0, MAX_RETAINED_CHECKPOINTS)
      .map((record) => record.checkpoint);
  }

  return (await legacyLogRecords(cwd)).map((record) => record.checkpoint);
}

export async function restoreCheckpoint(cwd: string, checkpointId: string): Promise<void> {
  if (!COMMIT_ID_RE.test(checkpointId)) {
    throw new Error(`Invalid checkpoint id: ${checkpointId}`);
  }

  const oid = await resolveListedCheckpoint(cwd, checkpointId);
  await ensureRepo(cwd);
  await isoGit.writeRef({ fs, dir: cwd, ref: CHECKPOINT_BRANCH_REF, value: oid, force: true });
  await isoGit.writeRef({
    fs,
    dir: cwd,
    ref: "HEAD",
    value: CHECKPOINT_BRANCH_REF,
    force: true,
    symbolic: true,
  });
  await isoGit.checkout({ fs, dir: cwd, ref: CHECKPOINT_BRANCH, force: true });
}

interface CheckpointRecord {
  ref: string | null;
  refName: string;
  order: number;
  checkpoint: Checkpoint;
}

async function ensureRepo(cwd: string): Promise<void> {
  if (!(await exists(path.join(cwd, ".git")))) {
    await isoGit.init({ fs, dir: cwd, defaultBranch: CHECKPOINT_BRANCH });
  }
  await isoGit.writeRef({
    fs,
    dir: cwd,
    ref: "HEAD",
    value: CHECKPOINT_BRANCH_REF,
    force: true,
    symbolic: true,
  });
}

function identity(name: string) {
  return { name, email: "felix@felix.local" };
}

async function stageWorktreeSnapshot(cwd: string): Promise<boolean> {
  const worktreeFiles = new Set(await listWorktreeFiles(cwd));
  const trackedFiles = new Set(await listTrackedFiles(cwd));

  for (const filepath of worktreeFiles) {
    await isoGit.add({ fs, dir: cwd, filepath });
  }
  for (const filepath of trackedFiles) {
    if (!worktreeFiles.has(filepath)) await isoGit.remove({ fs, dir: cwd, filepath });
  }

  const matrix = await isoGit.statusMatrix({ fs, dir: cwd, refresh: false });
  return matrix.some(([, head, , stage]) => head !== stage);
}

async function listTrackedFiles(cwd: string): Promise<string[]> {
  try {
    return await isoGit.listFiles({ fs, dir: cwd });
  } catch {
    return [];
  }
}

async function listWorktreeFiles(cwd: string): Promise<string[]> {
  const files: string[] = [];
  await walkWorktree(cwd, "", files);
  files.sort();
  return files;
}

async function walkWorktree(cwd: string, relativeDir: string, files: string[]): Promise<void> {
  const absoluteDir = path.join(cwd, relativeDir);
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const filepath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (await isIgnored(cwd, filepath)) continue;
    if (entry.isDirectory()) {
      await walkWorktree(cwd, filepath, files);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(filepath);
    }
  }
}

async function isIgnored(cwd: string, filepath: string): Promise<boolean> {
  try {
    return await isoGit.isIgnored({ fs, dir: cwd, filepath });
  } catch {
    return false;
  }
}

async function checkpointRecords(cwd: string): Promise<CheckpointRecord[]> {
  let refs: string[];
  try {
    refs = await isoGit.listRefs({ fs, dir: cwd, filepath: CHECKPOINT_REFS_DIR });
  } catch {
    return [];
  }

  const records: CheckpointRecord[] = [];
  for (const refName of refs) {
    const ref = checkpointRefFromName(refName);
    try {
      const oid = await isoGit.resolveRef({ fs, dir: cwd, ref });
      const commit = await isoGit.readCommit({ fs, dir: cwd, oid });
      records.push({
        ref,
        refName,
        order: checkpointRefOrder(refName),
        checkpoint: checkpointFromCommit(commit),
      });
    } catch {
      continue;
    }
  }
  return records;
}

async function legacyLogRecords(cwd: string): Promise<CheckpointRecord[]> {
  for (const ref of [CHECKPOINT_BRANCH_REF, "HEAD"]) {
    try {
      const commits = await isoGit.log({
        fs,
        dir: cwd,
        ref,
        depth: MAX_RETAINED_CHECKPOINTS,
      });
      return commits.map((commit, index) => ({
        ref: null,
        refName: commit.oid,
        order: commits.length - index,
        checkpoint: checkpointFromCommit(commit),
      }));
    } catch {
      continue;
    }
  }
  return [];
}

function checkpointFromCommit({ oid, commit }: ReadCommitResult): Checkpoint {
  const author = commit.author.name;
  return {
    id: oid,
    message: commit.message.split(/\r?\n/, 1)[0] ?? "",
    createdAt: new Date(commit.author.timestamp * 1000).toISOString(),
    author: author === "kid" || author === "felix" ? author : "system",
  };
}

async function resolveListedCheckpoint(cwd: string, checkpointId: string): Promise<string> {
  const checkpoints = await listCheckpoints(cwd);
  const matches = checkpoints.filter((checkpoint) =>
    checkpoint.id.toLowerCase().startsWith(checkpointId.toLowerCase()),
  );
  if (matches.length === 0) throw new Error(`Checkpoint not found: ${checkpointId}`);
  if (matches.length > 1) throw new Error(`Ambiguous checkpoint id: ${checkpointId}`);
  const [match] = matches;
  if (!match) throw new Error(`Checkpoint not found: ${checkpointId}`);
  return match.id;
}

async function pruneCheckpoints(cwd: string): Promise<void> {
  const records = (await checkpointRecords(cwd)).sort(compareCheckpointRecords);
  const stale = records.slice(MAX_RETAINED_CHECKPOINTS);
  for (const record of stale) {
    if (record.ref) await isoGit.deleteRef({ fs, dir: cwd, ref: record.ref });
  }
  await deleteNonCheckpointBranches(cwd);
  await pruneLooseObjects(cwd);
}

async function deleteNonCheckpointBranches(cwd: string): Promise<void> {
  let heads: string[];
  try {
    heads = await isoGit.listRefs({ fs, dir: cwd, filepath: "refs/heads" });
  } catch {
    return;
  }

  for (const head of heads) {
    if (head !== CHECKPOINT_BRANCH) {
      await isoGit.deleteRef({ fs, dir: cwd, ref: `refs/heads/${head}` }).catch(() => {});
    }
  }
}

async function pruneLooseObjects(cwd: string): Promise<void> {
  const retained = await checkpointRecords(cwd);
  const seeds = retained.map((record) => record.checkpoint.id);
  try {
    seeds.push(await isoGit.resolveRef({ fs, dir: cwd, ref: CHECKPOINT_BRANCH_REF }));
  } catch {
    // No branch yet.
  }

  const reachable = await collectReachableObjects(cwd, seeds);
  const objectsDir = path.join(cwd, ".git", "objects");
  let dirs: fs.Dirent[];
  try {
    dirs = await fsp.readdir(objectsDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const dirent of dirs) {
    if (!dirent.isDirectory() || !OBJECT_DIR_RE.test(dirent.name)) continue;
    const objectDir = path.join(objectsDir, dirent.name);
    const files = await fsp.readdir(objectDir).catch(() => []);
    for (const file of files) {
      if (!OBJECT_FILE_RE.test(file)) continue;
      const oid = `${dirent.name}${file}`;
      if (!reachable.has(oid)) await fsp.rm(path.join(objectDir, file), { force: true });
    }
    await fsp.rmdir(objectDir).catch(() => {});
  }
}

async function collectReachableObjects(cwd: string, seeds: string[]): Promise<Set<string>> {
  const reachable = new Set<string>();
  for (const oid of seeds) {
    await visitCommit(cwd, oid, reachable);
  }
  return reachable;
}

async function visitCommit(cwd: string, oid: string, reachable: Set<string>): Promise<void> {
  if (reachable.has(oid)) return;
  let commit: ReadCommitResult;
  try {
    commit = await isoGit.readCommit({ fs, dir: cwd, oid });
  } catch {
    return;
  }
  reachable.add(oid);
  await visitTree(cwd, commit.commit.tree, reachable);
}

async function visitTree(cwd: string, oid: string, reachable: Set<string>): Promise<void> {
  if (reachable.has(oid)) return;
  reachable.add(oid);
  const { tree } = await isoGit.readTree({ fs, dir: cwd, oid });
  for (const entry of tree) {
    if (entry.type === "tree") {
      await visitTree(cwd, entry.oid, reachable);
    } else {
      reachable.add(entry.oid);
    }
  }
}

function compareCheckpointRecords(a: CheckpointRecord, b: CheckpointRecord): number {
  return (
    b.order - a.order ||
    b.checkpoint.createdAt.localeCompare(a.checkpoint.createdAt) ||
    b.checkpoint.id.localeCompare(a.checkpoint.id)
  );
}

function nextCheckpointRefTime(): number {
  const now = Date.now();
  lastCheckpointRefTime = Math.max(now, lastCheckpointRefTime + 1);
  return lastCheckpointRefTime;
}

function checkpointRef(time: number, oid: string): string {
  return checkpointRefFromName(`${String(time).padStart(13, "0")}-${oid}`);
}

function checkpointRefFromName(refName: string): string {
  return `${CHECKPOINT_REFS_DIR}/${refName}`;
}

function checkpointRefOrder(refName: string): number {
  const [time] = refName.split("-", 1);
  const parsed = Number(time);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}
