import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS, IPC_INVOKE_CHANNELS, type CueNexaPreloadApi } from "../shared/ipc-contract.js";
import type { CueNexaService } from "./cuenexa-service.js";
import { withTrustedIpcSender } from "./renderer-trust.js";

export function registerCueNexaIpc(service: CueNexaService, trustedRendererUrl: string): void {
  for (const channel of IPC_INVOKE_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
  ipcMain.handle(IPC_CHANNELS.getStatus, (event) =>
    withTrustedIpcSender(invokeSenderUrl(event), trustedRendererUrl, () => service.getStatus()),
  );
  ipcMain.handle(IPC_CHANNELS.sync, (event) =>
    withTrustedIpcSender(invokeSenderUrl(event), trustedRendererUrl, () => service.sync()),
  );
  ipcMain.handle(IPC_CHANNELS.getReview, (event) =>
    withTrustedIpcSender(invokeSenderUrl(event), trustedRendererUrl, () => service.getReview()),
  );
  ipcMain.handle(IPC_CHANNELS.startRealtime, (event) =>
    withTrustedIpcSender(invokeSenderUrl(event), trustedRendererUrl, () => service.startRealtime()),
  );
  ipcMain.handle(IPC_CHANNELS.stopRealtime, (event) =>
    withTrustedIpcSender(invokeSenderUrl(event), trustedRendererUrl, () => service.stopRealtime()),
  );
  ipcMain.handle(IPC_CHANNELS.getProvisional, (event) =>
    withTrustedIpcSender(invokeSenderUrl(event), trustedRendererUrl, () => service.getProvisional()),
  );
}

export function listRegisteredIpcChannels(): readonly string[] {
  return [...IPC_INVOKE_CHANNELS];
}

export type HostPreloadSurface = CueNexaPreloadApi;

function invokeSenderUrl(event: IpcMainInvokeEvent): string | undefined {
  return event.senderFrame?.url ?? event.sender.getURL();
}
