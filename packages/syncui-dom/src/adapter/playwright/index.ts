import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import fs from "node:fs";
import type { UiAdapter } from "syncui/core/adapter/types";
import type { DomEmitter, Serialized } from "syncui/core/ops/instructions";
import { installPlaywrightBridge } from "./bridge";
import { createDispatchEvent } from "./dispatch";
import { createSnapshotGetter } from "./snapshot";
import type { PlaywrightAdapterDeps } from "./types";

export type { PlaywrightAdapterDeps } from "./types";

export function createPlaywrightAdapter(
  deps: PlaywrightAdapterDeps
): UiAdapter {
  if (!deps?.page) {
    throw new Error("Playwright adapter requires a Playwright Page instance.");
  }
  const { page } = deps;
  const emitter = new EventEmitter() as DomEmitter;
  const bindingName = `syncuiEmitInstruction_${crypto
    .randomUUID()
    .replace(/-/g, "")}`;
  const bridgeState = { contentSet: false, installed: false };
  let bridgePromise: Promise<void> | null = null;

  const ensureBridge = async (): Promise<void> => {
    if (bridgePromise) {
      return bridgePromise;
    }
    bridgePromise = installPlaywrightBridge(
      page,
      {
        bindingName,
        htmlDocument: deps.htmlDocument,
        url: deps.url,
        state: bridgeState,
      },
      (instruction) => {
        emitter.emit("instruction", instruction as Serialized);
      }
    );
    return bridgePromise;
  };

  const evalInPage = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    await ensureBridge();
    return page.evaluate(fn);
  };

  const evalInPageWithArg = async <T, Arg>(
    fn: (arg: Arg) => T | Promise<T>,
    arg: Arg
  ): Promise<T> => {
    await ensureBridge();
    const evaluate = page.evaluate.bind(page) as <TResult, TArg>(
      pageFunction: (arg: TArg) => TResult | Promise<TResult>,
      pageArg: TArg
    ) => Promise<TResult>;
    return evaluate(fn, arg);
  };

  const dispatchEvent = createDispatchEvent(evalInPageWithArg);
  const getSnapshot = createSnapshotGetter(evalInPage);

  function domImport(moduleUrl: string) {
    void (async () => {
      await ensureBridge();
      const code = await fs.promises.readFile(moduleUrl, "utf-8");
      await page.evaluate((script) => {
        const tag = document.createElement("script");
        tag.setAttribute("data-syncui-allow", "true");
        tag.textContent = script;
        document.head.appendChild(tag);
      }, code);
    })().catch((err) => {
      console.error(`Error importing ${moduleUrl}: ${String(err)}`);
    });
  }

  function terminate() {
    // No-op: the host owns the Playwright page lifecycle.
  }

  async function evalString(code: string): Promise<unknown> {
    return evalInPageWithArg((script) => Function(script)(), code);
  }

  return {
    emitter,
    dispatchEvent,
    domImport,
    terminate,
    evalString,
    getSnapshot,
  };
}
