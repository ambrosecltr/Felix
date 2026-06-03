import * as os from "node:os";

/**
 * Builds a macOS Seatbelt (sandbox-exec) profile that confines a process
 * so it can only write inside the given mini app directory (plus standard
 * temp + shared caches), while still allowing read of system libraries it
 * needs to run. Network can be allowed or denied.
 *
 * This is the same OS-level mechanism Claude Code / Codex use to jail an
 * agent to a working directory. On non-macOS platforms callers should skip
 * sandboxing.
 */
export function buildSeatbeltProfile(options: {
  appDir: string;
  allowNetwork: boolean;
}): string {
  const { appDir, allowNetwork } = options;
  const home = os.homedir();
  const tmp = os.tmpdir();

  const writable = [appDir, tmp, `${home}/.bun`, `${home}/.npm`, `${home}/.cache`];
  const writeRules = writable
    .map((p) => `  (subpath "${p}")`)
    .join("\n");

  return `(version 1)
(deny default)

; Read-only access to the whole filesystem so tools/runtimes can load.
(allow file-read*)

; Write access only within the mini app and shared caches.
(allow file-write*
${writeRules}
)

; Process + runtime essentials.
(allow process-exec)
(allow process-fork)
(allow sysctl-read)
(allow mach-lookup)
(allow signal (target self))

; Network.
${allowNetwork ? "(allow network*)" : "(deny network*)"}
`;
}

export function isSandboxAvailable(): boolean {
  return process.platform === "darwin";
}

/**
 * Wraps a command so it runs inside the Seatbelt sandbox. Returns the
 * command + args to spawn. On unsupported platforms, returns the original.
 */
export function wrapWithSandbox(
  profilePath: string,
  command: string,
  args: string[],
): { command: string; args: string[] } {
  if (!isSandboxAvailable()) return { command, args };
  return {
    command: "/usr/bin/sandbox-exec",
    args: ["-f", profilePath, command, ...args],
  };
}
