import { contextBridge, ipcRenderer } from "electron";

const IPC_CHANNELS = {
  getStatus: "cuenexa:get-status",
  sync: "cuenexa:sync",
  getReview: "cuenexa:get-review",
} as const;

contextBridge.exposeInMainWorld("cuenexa", {
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getStatus),
  sync: () => ipcRenderer.invoke(IPC_CHANNELS.sync),
  getReview: () => ipcRenderer.invoke(IPC_CHANNELS.getReview),
});
