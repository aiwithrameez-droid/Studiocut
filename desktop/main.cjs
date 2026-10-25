const { app, BrowserWindow, shell } = require("electron");

const DEFAULT_APP_URL = "https://oneramsa.com";
const appUrl = process.env.STUDIOCUT_APP_URL || DEFAULT_APP_URL;
const parsedAppUrl = new URL(appUrl);
const appOrigin = parsedAppUrl.origin;
const isLocalDevelopmentUrl =
  parsedAppUrl.protocol === "http:" &&
  ["localhost", "127.0.0.1"].includes(parsedAppUrl.hostname);

if (parsedAppUrl.protocol !== "https:" && !isLocalDevelopmentUrl) {
  throw new Error(
    "StudioCut desktop must load from HTTPS (or local HTTP during development).",
  );
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: "#101114",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webviewTag: false,
          },
        },
      };
    }

    if (url.startsWith("mailto:")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, targetUrl) => {
    let target;
    try {
      target = new URL(targetUrl);
    } catch {
      event.preventDefault();
      return;
    }

    if (target.protocol !== "https:" && target.origin !== appOrigin) {
      event.preventDefault();
      if (target.protocol === "mailto:") void shell.openExternal(targetUrl);
    }
  });

  void window.loadURL(appUrl);
  return window;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
