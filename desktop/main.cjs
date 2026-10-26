const { app, BrowserWindow, Menu, dialog, protocol, session, shell } = require("electron");
const path = require("node:path");
const { readLocalContent } = require("./local-content.cjs");

// A stable, secure origin preserves IndexedDB between launches without a
// network server or file:// restrictions. Never load the hosted website here.
protocol.registerSchemesAsPrivileged([{
  scheme: "studiocut",
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

const APP_ORIGIN = "studiocut://app";
let mainWindow;
let quitting = false;
const smoke = process.argv.includes("--smoke-test");

function createWindow() {
  const window = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1024, minHeight: 720,
    backgroundColor: "#101114",
    title: "StudioCut — Signal Cut",
    show: !smoke,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      sandbox: true, webviewTag: false,
    },
  });
  mainWindow = window;
  window.webContents.setWindowOpenHandler(({ url }) => {
    const target = new URL(url);
    if (["https:", "mailto:"].includes(target.protocol)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!targetUrl.startsWith(APP_ORIGIN + "/")) event.preventDefault();
  });
  // Give the editor's existing autosave time to settle; users can cancel.
  window.on("close", (event) => {
    if (quitting || smoke) return;
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(window, {
      type: "question", buttons: ["Keep editing", "Close StudioCut"],
      defaultId: 0, cancelId: 0,
      title: "Close StudioCut?",
      message: "Have your edits finished saving?",
      detail: "Wait for imports and exports to finish before closing. Keep project backups for important work.",
    });
    if (choice === 1) {
      quitting = true;
      window.close();
    }
  });
  window.on("closed", () => { mainWindow = null; quitting = false; });
  void window.loadURL(APP_ORIGIN + "/projects").then(async () => {
    if (smoke) await require("./smoke-test.cjs")(window, app);
  }).catch((error) => {
    console.error("Desktop startup failed:", error);
    if (smoke) app.exit(1);
    else dialog.showErrorBox("StudioCut could not load", error.message);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    const rendererRoot = path.join(app.getAppPath(), "dist", "desktop");
    protocol.handle("studiocut", async (request) => {
      const result = await readLocalContent(rendererRoot, request.url);
      return new Response(result.body, {
        status: result.status,
        headers: {
          "Content-Type": result.type,
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
          "X-Content-Type-Options": "nosniff",
        },
      });
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    if (smoke) {
      session.defaultSession.webRequest.onBeforeRequest({ urls: ["https://*/*", "http://*/*"] }, (_details, callback) => callback({ cancel: true }));
    }
    session.defaultSession.on("will-download", (_event, item) => {
      item.setSaveDialogOptions({ title: "Save StudioCut file", defaultPath: path.join(app.getPath("downloads"), item.getFilename()) });
      item.once("done", (_doneEvent, state) => {
        if (state === "interrupted") {
          void dialog.showMessageBox({ type: "error", message: "The file could not be saved.", detail: "Check disk space and folder permissions, then try again." });
        }
      });
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      { label: "File", submenu: [{ role: "close" }, { role: "quit" }] },
      { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" },
      { label: "Help", submenu: [{
        label: "About StudioCut Desktop",
        click: () => void dialog.showMessageBox({
          type: "info", message: `StudioCut ${app.getVersion()}`,
          detail: "Signal Cut — local video editing.\nProjects and imported media stay on this computer. Use .studiocut backups to transfer projects.\nPreview and export require working graphics acceleration. Windows 10+, macOS 12+ (Intel) or macOS 13+ (Apple Silicon). High Sierra is not supported.",
        }),
      }] },
    ]));
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }).catch((error) => {
    dialog.showErrorBox("StudioCut could not start", error.message);
    app.quit();
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
