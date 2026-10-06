import { ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  IPC_CHANNELS,
  SANITIZED_ERROR_MESSAGES,
  type ConnectionStatusDto,
  type CueNexaPreloadApi,
  type ReviewSnapshotDto,
} from "../shared/ipc-contract.js";
import type { CueNexaService } from "./cuenexa-service.js";
import { isTrustedIpcSender } from "./renderer-trust.js";

export function registerCueNexaIpc(service: CueNexaService, trustedRendererUrl: string): void {
  ipcMain.removeHandler(IPC_CHANNELS.getStatus);
  ipcMain.removeHandler(IPC_CHANNELS.sync);
  ipcMain.removeHandler(IPC_CHANNELS.getReview);
  ipcMain.handle(IPC_CHANNELS.getStatus, (event) => {
    if (!isTrustedInvoke(event, trustedRendererUrl)) {
      return untrustedStatus();
    }
    return service.getStatus();
  });
  ipcMain.handle(IPC_CHANNELS.sync, (event) => {
    if (!isTrustedInvoke(event, trustedRendererUrl)) {
      return untrustedReview(service);
    }
    return service.sync();
  });
  ipcMain.handle(IPC_CHANNELS.getReview, (event) => {
    if (!isTrustedInvoke(event, trustedRendererUrl)) {
      return untrustedReview(service);
    }
    return service.getReview();
  });
}

export function listRegisteredIpcChannels(): readonly string[] {
  return [IPC_CHANNELS.getStatus, IPC_CHANNELS.sync, IPC_CHANNELS.getReview];
}

export type HostPreloadSurface = CueNexaPreloadApi;

function isTrustedInvoke(event: IpcMainInvokeEvent, trustedRendererUrl: string): boolean {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  return isTrustedIpcSender(senderUrl, trustedRendererUrl);
}

function untrustedStatus(): ConnectionStatusDto {
  return {
    beeAvailable: false,
    authenticated: false,
    timeZone: null,
    lastSyncedAt: null,
    complete: false,
    errorCode: "sync_failed",
    errorMessage: SANITIZED_ERROR_MESSAGES.sync_failed,
  };
}

function untrustedReview(service: CueNexaService): ReviewSnapshotDto {
  const review = service.getReview();
  return {
    ...review,
    complete: false,
    changeCount: 0,
    errorCode: "sync_failed",
    errorMessage: SANITIZED_ERROR_MESSAGES.sync_failed,
  };
}
