import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

interface SkillPackageFile {
  path: string;
  content: string;
  overwrite: true;
}

const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "skill-packages");

const TEXT_PACKAGE_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".svg",
  ".txt",
  ".yaml",
  ".yml",
]);

export function felixSkillPackageFiles(): SkillPackageFile[] {
  const packageRoot = resolvePackageRoot();

  return fs
    .readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => readPackageFiles(packageRoot, entry.name))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function resolvePackageRoot(): string {
  if (!fs.existsSync(PACKAGE_ROOT)) {
    throw new Error(`Felix skill packages are missing: ${PACKAGE_ROOT}`);
  }
  return PACKAGE_ROOT;
}

function readPackageFiles(packageRoot: string, packageName: string): SkillPackageFile[] {
  const packagePath = path.join(packageRoot, packageName);
  return walkTextFiles(packagePath).map((filePath) => {
    const relativePath = path.relative(packagePath, filePath).split(path.sep).join("/");
    return {
      path: `.pi/skills/${packageName}/${relativePath}`,
      content: fs.readFileSync(filePath, "utf8"),
      overwrite: true,
    };
  });
}

function walkTextFiles(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walkTextFiles(entryPath);
      if (entry.isFile() && TEXT_PACKAGE_EXTENSIONS.has(path.extname(entry.name))) {
        return [entryPath];
      }
      return [];
    })
    .sort();
}
