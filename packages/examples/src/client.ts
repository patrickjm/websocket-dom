import { SyncUIClient } from "syncui/client";

const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const wsUrl = `${protocol}://${window.location.host}`;
const client = new SyncUIClient(wsUrl);
client.connect();

void client;
