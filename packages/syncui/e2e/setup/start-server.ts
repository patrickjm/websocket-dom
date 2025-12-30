import { TestServer } from "./server";

const server = new TestServer();

process.on("unhandledRejection", (error) => {
  console.error("E2E server unhandled rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("E2E server uncaught exception:", error);
});

server.start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
