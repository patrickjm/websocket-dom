import { dirname, join } from "path";
import type { MessageToWorker, SerializedEvent } from "./shared-utils";

const __dirname = dirname(new URL(import.meta.url).pathname);

export type ReactSyncUiDomAdapter = {
  import: (path: string) => void;
  on: (event: "clientEvent", handler: (event: SerializedEvent) => void) => void;
  postWorkerMessage: (message: MessageToWorker) => void;
};

export function loadReactSyncUiDom(wsDom: ReactSyncUiDomAdapter) {
  wsDom.import(join(__dirname.replace("src", "dist"), "worker.js"));

  wsDom.on("clientEvent", (event) => {
    wsDom.postWorkerMessage({
      type: "_react_event",
      event,
    } as MessageToWorker);
  });
}
