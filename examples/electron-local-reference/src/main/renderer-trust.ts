import { pathToFileURL } from "node:url";

export function resolveTrustedRendererUrl(rendererHtmlPath: string): string {
  return canonicalizeFileUrl(pathToFileURL(rendererHtmlPath).href);
}

export function canonicalizeFileUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.href;
  } catch {
    return url;
  }
}

export function isTrustedRendererNavigation(url: string, trustedRendererUrl: string): boolean {
  if (!url.startsWith("file:")) {
    return false;
  }
  return canonicalizeFileUrl(url) === canonicalizeFileUrl(trustedRendererUrl);
}

export function isTrustedIpcSender(senderUrl: string | undefined, trustedRendererUrl: string): boolean {
  if (!senderUrl) {
    return false;
  }
  return isTrustedRendererNavigation(senderUrl, trustedRendererUrl);
}

export const UNTRUSTED_IPC_SENDER_MESSAGE = "IPC sender is not trusted.";

export class UntrustedIpcSenderError extends Error {
  constructor() {
    super(UNTRUSTED_IPC_SENDER_MESSAGE);
    this.name = "UntrustedIpcSenderError";
  }
}

export function withTrustedIpcSender<T>(
  senderUrl: string | undefined,
  trustedRendererUrl: string,
  run: () => T,
): T {
  if (!isTrustedIpcSender(senderUrl, trustedRendererUrl)) {
    throw new UntrustedIpcSenderError();
  }
  return run();
}
