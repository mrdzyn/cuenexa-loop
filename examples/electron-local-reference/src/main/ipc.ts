import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS, type CueNexaPreloadApi } from "../shared/ipc-contract.js";
import type { CueNexaService } from "./cuenexa-service.js";
import { withTrustedIpcSender } from "./renderer-trust.js";

export function registerCueNexaIpc(service: CueNexaService, trustedRendererUrl: string): void {
  ipcMain.removeHandler(IPC_CHANNELS.getStatus);
  ipcMain.removeHandler(IPC_CHANNELS.sync);
  ipcMain.removeHandler(IPC_CHANNELS.getReview);
  ipcMain.handle(IPC_CHANNELS.getStatus, (event) =>
    withTrustedIpcSender(invokeSenderUrl(event), trustedRendererUrl, () => service.getStatus()),
  );
  ipcMain.handle(IPC_CHANNELS.sync, (event) =>
    withTrustedIpcSender(invokeSenderUrl(event), trustedRendererUrl, () => service.sync()),
  );
  ipcMain.handle(IPC_CHANNELS.getReview, (event) =>
    withTrustedIpcSender(invokeSenderUrl(event), trustedRendererUrl, () => service.getReview()),
  );
}

export function listRegisteredIpcChannels(): readonly string[] {
  return [IPC_CHANNELS.getStatus, IPC_CHANNELS.sync, IPC_CHANNELS.getReview];
}

export type HostPreloadSurface = CueNexaPreloadApi;

function invokeSenderUrl(event: IpcMainInvokeEvent): string | undefined {
  return event.senderFrame?.url ?? event.sender.getURL();
}
