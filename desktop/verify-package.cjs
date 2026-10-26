const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");

function archives(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? archives(file) : entry.name === "app.asar" ? [file] : [];
  });
}

const packages = archives(path.resolve("installers"));
if (!packages.length) throw new Error("No packaged desktop app was found");
for (const archive of packages) {
  const files = asar.listPackage(archive).map(file => file.replaceAll("\\", "/"));
  for (const required of ["/main.cjs", "/local-content.cjs", "/smoke-test.cjs", "/dist/desktop/desktop.html"]) {
    if (!files.includes(required)) throw new Error(`Missing bundled file ${required} in ${archive}`);
  }
  if (!files.some(file => file.endsWith(".wasm"))) throw new Error("Bundled editor WASM is missing");
  if (!files.some(file => file.startsWith("/dist/desktop/assets/") && file.endsWith(".js"))) {
    throw new Error("Bundled editor JavaScript is missing");
  }
  console.log(`Verified self-contained desktop package: ${archive}`);
}
