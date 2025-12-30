import { SyncUIClient } from "syncui/client";

const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const wsUrl = `${protocol}://${window.location.host}`;
const client = new SyncUIClient(wsUrl);
client.connect();

document.addEventListener(
  "click",
  (event) => {
    const target = event.target as HTMLElement | null;
    const link = target?.closest("a") as HTMLAnchorElement | null;
    if (!link || !link.href) {
      return;
    }
    if (link.target && link.target !== "_self") {
      return;
    }
    event.preventDefault();
    client.transport?.send(
      JSON.stringify({ type: "navigate", url: link.href })
    );
  },
  true
);
