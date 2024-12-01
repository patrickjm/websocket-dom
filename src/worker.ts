
declare global {
  interface Console {
    client: {
      log(...args: unknown[]): void;
      debug(...args: unknown[]): void;
      warn(...args: unknown[]): void;
      error(...args: unknown[]): void;
      trace(...args: unknown[]): void;
    }
  }
}

export {}