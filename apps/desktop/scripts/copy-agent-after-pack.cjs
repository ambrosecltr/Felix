const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = async function copyAgentAfterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const productName = context.packager.appInfo.productFilename;
  const appResourcesDir = path.join(
    context.appOutDir,
    `${productName}.app`,
    "Contents",
    "Resources",
  );
  const source = path.join(context.packager.projectDir, "resources", "agent");
  const target = path.join(appResourcesDir, "agent");

  await fs.rm(target, { recursive: true, force: true });
  await fs.cp(source, target, { recursive: true, dereference: true });
};
