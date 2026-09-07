/** Only explicit, visible work belongs here. Background fetches are never intercepted. */
export function createLoadingStore() {
  const operations = new Set<symbol>();
  const listeners = new Set<() => void>();
  const publish = () => listeners.forEach((listener) => listener());
  return {
    getSnapshot: () => operations.size,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    begin() {
      const token = Symbol("visible operation");
      operations.add(token);
      publish();
      return () => {
        if (operations.delete(token)) publish();
      };
    },
  };
}

export const globalLoadingStore = createLoadingStore();
export const beginGlobalLoading = globalLoadingStore.begin;
export const MIN_VISIBLE_MS = 180;
export const FINISH_ANIMATION_MS = 120;

/** Time-based (not frame-rate-based), monotonic, and capped until real work commits. */
export function adaptiveProgress(elapsed: number) {
  const time = Math.max(0, elapsed);
  if (time <= 700) return 55 * time / 700;
  if (time <= 2200) return 55 + 25 * (time - 700) / 1500;
  return 80 + 15 * (1 - Math.exp(-(time - 2200) / 4500));
}
