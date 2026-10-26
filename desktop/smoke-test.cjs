// Native CI startup smoke check. No account or internet connection is used.
module.exports = async function smokeTest(window, app) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(`
      (async () => {
        if (!window.isSecureContext || !window.indexedDB) throw new Error("Local origin is not secure or has no IndexedDB");
        const button = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "New project");
        if (!button) return false;
        button.click();
        return true;
      })()
    `);
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(`
      location.protocol === "studiocut:" &&
      location.pathname.startsWith("/editor/") &&
      !!document.querySelector('[data-testid="button-import-media"]')
    `);
    if (ready) {
      console.log("DESKTOP_SMOKE_OK: bundled editor opened a local project with network blocked");
      app.exit(0);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Bundled desktop editor did not become ready within 60 seconds");
};
