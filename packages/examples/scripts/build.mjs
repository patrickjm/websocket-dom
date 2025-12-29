import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const distRoot = path.join(root, "dist");
const clientOut = path.join(distRoot, "client");
const workerOut = path.join(distRoot, "worker");

await mkdir(clientOut, { recursive: true });
await mkdir(workerOut, { recursive: true });

await build({
  entryPoints: [path.join(root, "src", "client.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  sourcemap: true,
  outfile: path.join(clientOut, "client.js"),
});

await build({
  entryPoints: [path.join(root, "src", "worker.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: true,
  outfile: path.join(workerOut, "worker.js"),
});

await build({
  entryPoints: [path.join(root, "src", "server.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: true,
  outfile: path.join(distRoot, "server.js"),
  external: ["jsdom"],
});

await copyFile(
  path.join(root, "public", "index.html"),
  path.join(clientOut, "index.html")
);
