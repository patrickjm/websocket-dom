const suppressedTargets = new WeakSet<EventTarget>();

export function withSuppressedTarget<T>(target: EventTarget, fn: () => T): T {
  suppressedTargets.add(target);
  try {
    return fn();
  } finally {
    suppressedTargets.delete(target);
  }
}

export function isTargetSuppressed(target: EventTarget): boolean {
  return suppressedTargets.has(target);
}
