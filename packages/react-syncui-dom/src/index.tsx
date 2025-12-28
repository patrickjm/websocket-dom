import type { MessageToWorker, SerializedEvent } from "./shared-utils";

const resolveWorkerPath = (): string => {
  const workerUrl = new URL(/* @vite-ignore */ "./worker.js", import.meta.url);
  if (workerUrl.protocol !== "file:") {
    return workerUrl.toString();
  }
  let pathname = decodeURIComponent(workerUrl.pathname);
  if (
    pathname.length > 2 &&
    pathname.startsWith("/") &&
    /[A-Za-z]/.test(pathname[1]) &&
    pathname[2] === ":"
  ) {
    pathname = pathname.slice(1);
  }
  return pathname;
};

export type ReactSyncUiDomAdapter = {
  import: (path: string) => void;
  on: (event: "clientEvent", handler: (event: SerializedEvent) => void) => void;
  postWorkerMessage: (message: MessageToWorker) => void;
};

export function loadReactSyncUiDom(wsDom: ReactSyncUiDomAdapter) {
  wsDom.import(resolveWorkerPath());

  wsDom.on("clientEvent", (event) => {
    wsDom.postWorkerMessage({
      type: "_react_event",
      event,
    } as MessageToWorker);
  });
}
