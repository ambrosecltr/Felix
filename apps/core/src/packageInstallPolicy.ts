import * as path from "node:path";

export const MINI_APP_MINIMUM_RELEASE_AGE_SECONDS = 3 * 24 * 60 * 60;

export function miniAppBunfig(): string {
  return `[install]
minimumReleaseAge = ${MINI_APP_MINIMUM_RELEASE_AGE_SECONDS}
`;
}

export function miniAppBunInstallArgs(): string[] {
  return ["install", `--minimum-release-age=${MINI_APP_MINIMUM_RELEASE_AGE_SECONDS}`];
}

export function miniAppBunWrapperDir(appDir: string): string {
  return path.join(appDir, ".felix", "bin");
}

export function miniAppBunWrapperPath(appDir: string): string {
  return path.join(miniAppBunWrapperDir(appDir), process.platform === "win32" ? "bun.cmd" : "bun");
}

export function miniAppBunWrapperScript(realBunBin: string): string {
  if (process.platform === "win32") {
    return [
      "@echo off",
      'set "cmd=%~1"',
      'if "%cmd%"=="install" goto with_policy',
      'if "%cmd%"=="add" goto with_policy',
      'if "%cmd%"=="update" goto with_policy',
      `"${realBunBin}" %*`,
      "exit /b %ERRORLEVEL%",
      ":with_policy",
      `"${realBunBin}" %* --minimum-release-age=${MINI_APP_MINIMUM_RELEASE_AGE_SECONDS}`,
      "",
    ].join("\r\n");
  }

  return `#!/bin/sh
case "$1" in
  install|add|update)
    exec "${escapeShellDoubleQuoted(realBunBin)}" "$@" --minimum-release-age=${MINI_APP_MINIMUM_RELEASE_AGE_SECONDS}
    ;;
  *)
    exec "${escapeShellDoubleQuoted(realBunBin)}" "$@"
    ;;
esac
`;
}

function escapeShellDoubleQuoted(value: string): string {
  return value.replace(/["\\$`]/g, "\\$&");
}
