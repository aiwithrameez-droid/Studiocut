// Native CI checks with network blocked. This is not a GPU export benchmark.
const fs = require("node:fs/promises");

module.exports = async function smokeTest(window, app) {
  async function waitFor(script, stage) {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (await window.webContents.executeJavaScript(script)) return;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const diagnostic = await window.webContents.executeJavaScript(`({
      url: location.href, secure: isSecureContext,
      viewport: [innerWidth, innerHeight],
      text: document.body.innerText.slice(0, 3500)
    })`);
    console.error("DESKTOP_SMOKE_DIAGNOSTIC:", stage, diagnostic);
    await fs.writeFile("desktop-failure.png", (await window.webContents.capturePage()).toPNG());
    throw new Error(`Desktop smoke check timed out at: ${stage}`);
  }

  await waitFor(`(async () => {
    if (!isSecureContext || !indexedDB) throw new Error("Local origin is not secure or has no IndexedDB");
    const button = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "New project");
    if (!button) return false;
    button.click();
    return true;
  })()`, "create local project");
  await waitFor(`location.protocol === "studiocut:" &&
    location.pathname.startsWith("/editor/") &&
    !!document.querySelector('[data-testid="input-import-media"]')`, "open editor");
  await window.webContents.executeJavaScript(`(async () => {
    [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Skip intro")?.click();
    const canvas = document.createElement("canvas");
    canvas.width = 8; canvas.height = 8;
    const context = canvas.getContext("2d");
    context.fillStyle = "#b4c406"; context.fillRect(0, 0, 8, 8);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not generate a test image");
    const files = new DataTransfer();
    files.items.add(new File([blob], "desktop-smoke.png", { type: "image/png" }));
    const input = document.querySelector('[data-testid="input-import-media"]');
    input.files = files.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitFor(`document.body.textContent.includes("desktop-smoke.png") &&
    !document.querySelector('[data-testid="button-import-media"]').disabled`, "import local media");
  // A full reload verifies that the custom origin can restore its local data.
  await new Promise(resolve => {
    window.webContents.once("did-finish-load", resolve);
    window.webContents.reload();
  });
  await waitFor(`!!document.querySelector('[data-testid="input-import-media"]') &&
    document.body.textContent.includes("desktop-smoke.png")`, "restore imported media after reload");
  await fs.writeFile("desktop-startup.png", (await window.webContents.capturePage()).toPNG());
  console.log("DESKTOP_SMOKE_OK: bundled editor created a project, imported a PNG and restored it after reload with network blocked");
  app.exit(0);
};
