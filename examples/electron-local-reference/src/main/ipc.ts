import { ipcMain } from "electron";
import { IPC_CHANNELS, type CueNexaPreloadApi } from "../shared/ipc-contract.js";
import type { CueNexaService } from "./cuenexa-service.js";

export function registerCueNexaIpc(service: CueNexaService): void {
  ipcMain.removeHandler(IPC_CHANNELS.getStatus);
  ipcMain.removeHandler(IPC_CHANNELS.sync);
  ipcMain.removeHandler(IPC_CHANNELS.getReview);
  ipcMain.handle(IPC_CHANNELS.getStatus, () => service.getStatus());
  ipcMain.handle(IPC_CHANNELS.sync, () => service.sync());
  ipcMain.handle(IPC_CHANNELS.getReview, () => service.getReview());
}

export function listRegisteredIpcChannels(): readonly string[] {
  return [IPC_CHANNELS.getStatus, IPC_CHANNELS.sync, IPC_CHANNELS.getReview];
}

export type HostPreloadSurface = CueNexaPreloadApi;
