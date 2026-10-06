import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";
import { BeeAdapterClient } from "@cuenexa-loop/bee-adapter";
import { LoopStore } from "@cuenexa-loop/loop-store";
import { CueNexaService, resolveElectronStorePath } from "./cuenexa-service.js";
import { registerCueNexaIpc } from "./ipc.js";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

function createService(): CueNexaService {
  const storePath = resolveElectronStorePath({
    userDataPath: app.getPath("userData"),
    env: process.env,
  });
  return new CueNexaService({
    client: new BeeAdapterClient(),
    store: new LoopStore({ path: storePath }),
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 960,
    height: 720,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(moduleDirectory, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const allowed = url.startsWith("file:");
    if (!allowed) {
      event.preventDefault();
    }
  });

  void window.loadFile(join(moduleDirectory, "../renderer/index.html"));
  return window;
}

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});

void app.whenReady().then(() => {
  registerCueNexaIpc(createService());
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
