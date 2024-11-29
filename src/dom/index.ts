import { EventEmitter } from "events";
import { readFile } from "fs/promises";
import { JSDOM } from "jsdom";
import { builtinModules, createRequire } from "module";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import vm, { Module, SourceTextModule, SyntheticModule } from "vm";
import type { SerializedEvent } from "../client/types";
import { dispatchEvent as _dispatchEvent } from "./events";
import { type DomEmitter } from "./instructions";
import { NodeStash } from "./nodes";
import { extendPrototypes } from "./prototypes";
import { createBrowserStorage } from "./utils";

export function createDom(doc: string, { url }: { url: string }) {
  let nodes: NodeStash;
  const emitter = new EventEmitter() as DomEmitter;

  const dom = new JSDOM(
    doc,
    {
      url,
      pretendToBeVisual: true,
      contentType: 'text/html',
      runScripts: "outside-only",
      resources: "usable",
      beforeParse(window) {
        nodes = new NodeStash(window);
        extendPrototypes(window, nodes, emitter);
      },
    }
  );

  const window = dom.window;
  const document = window.document;

  const localStorage = createBrowserStorage();
  const sessionStorage = createBrowserStorage();

  const context = vm.createContext({
    window,
    document,
    console,
    localStorage,
    sessionStorage,
  });

  function dispatchEvent(event: SerializedEvent) {
    _dispatchEvent(nodes, emitter, window, event);
  }

  async function execute(code: string, currentPath: string): Promise<void> {
    // Use 'file://' URL for module identifiers when possible
    const moduleIdentifier = path.isAbsolute(currentPath)
      ? pathToFileURL(currentPath).href
      : currentPath;
  
    const module = new SourceTextModule(code, {
      context,
      identifier: moduleIdentifier,
    });
  
    async function linker(specifier: string, referencingModule: Module): Promise<Module> {
      if (specifier.startsWith('node:') || builtinModules.includes(specifier)) {
        // Handle built-in modules
        const mod = await import(specifier);
        const exportNames = Object.keys(mod);
  
        return new SyntheticModule(
          exportNames,
          function () {
            for (const name of exportNames) {
              this.setExport(name, mod[name]);
            }
          },
          {
            context,
            identifier: specifier,
          },
        );
      } else {
        let resolvedPath: string;
  
        if (specifier.startsWith('.') || specifier.startsWith('/')) {
          // Resolve relative to the referencing module
          const baseURL = referencingModule.identifier.startsWith('file://')
            ? new URL('.', referencingModule.identifier).href
            : path.dirname(referencingModule.identifier);
  
          resolvedPath = new URL(specifier, baseURL).href;
        } else {
          // Resolve modules from node_modules using require.resolve
          const require = createRequire(
            referencingModule.identifier.startsWith('file://')
              ? fileURLToPath(referencingModule.identifier)
              : referencingModule.identifier,
          );
  
          try {
            resolvedPath = pathToFileURL(require.resolve(specifier)).href;
          } catch (e) {
            throw new Error(`Cannot resolve module '${specifier}'`);
          }
        }
  
        const sourcePath = fileURLToPath(resolvedPath);
  
        let source: string;
        try {
          source = await readFile(sourcePath, 'utf-8');
        } catch (e: any) {
          throw new Error(`Cannot read module '${specifier}' at '${sourcePath}': ${e.message}`);
        }
  
        const childModule = new SourceTextModule(source, {
          context,
          identifier: resolvedPath,
        });
  
        await childModule.link(linker);
  
        return childModule;
      }
    }
  
    await module.link(linker);
    await module.evaluate();
  }

  return {
    emitter,
    window,
    document,
    dispatchEvent,
    execute,
    context
  }
}