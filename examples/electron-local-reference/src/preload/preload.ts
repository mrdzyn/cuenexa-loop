import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

const IPC_CHANNELS = {
  getStatus: "cuenexa:get-status",
  sync: "cuenexa:sync",
  getReview: "cuenexa:get-review",
  startRealtime: "cuenexa:start-realtime",
  stopRealtime: "cuenexa:stop-realtime",
  getProvisional: "cuenexa:get-provisional",
  provisionalUpdated: "cuenexa:provisional-updated",
} as const;

contextBridge.exposeInMainWorld("cuenexa", {
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getStatus),
  sync: () => ipcRenderer.invoke(IPC_CHANNELS.sync),
  getReview: () => ipcRenderer.invoke(IPC_CHANNELS.getReview),
  startRealtime: () => ipcRenderer.invoke(IPC_CHANNELS.startRealtime),
  stopRealtime: () => ipcRenderer.invoke(IPC_CHANNELS.stopRealtime),
  getProvisional: () => ipcRenderer.invoke(IPC_CHANNELS.getProvisional),
  onProvisionalUpdate: (listener: (snapshot: unknown) => void) => {
    const wrapped = (_event: IpcRendererEvent, snapshot: unknown) => listener(snapshot);
    ipcRenderer.on(IPC_CHANNELS.provisionalUpdated, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.provisionalUpdated, wrapped);
  },
});
