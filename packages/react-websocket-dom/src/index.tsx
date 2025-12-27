import { dirname, join} from 'path';
import type { WebsocketDOM } from 'websocket-dom';
import type { MessageToWorker } from './shared-utils';

const __dirname = dirname(new URL(import.meta.url).pathname);

export function loadReactWebsocketDOM(wsDom: WebsocketDOM) {
  wsDom.import(join(__dirname.replace('src', 'dist'), 'worker.js'));

  wsDom.on('clientEvent', event => {
    wsDom.postWorkerMessage({
      type: '_react_event',
      event,
    } as MessageToWorker);
  });
}