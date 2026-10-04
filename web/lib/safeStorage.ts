/* =========================================================
   Storage that never throws.

   localStorage is unavailable in more places than people expect: Safari private
   windows, "block all cookies" settings, and any document with an opaque origin —
   including a page embedded in a sandboxed iframe (a preview panel, for example).
   Touching it there throws a SecurityError, and because these calls sit in the
   providers that wrap every page, one throw takes the whole app down.

   These helpers swallow that and fall back to memory. The UI then behaves like a
   fresh visitor: defaults instead of saved preferences, nothing persisted.
   ========================================================= */

const memory = new Map<string, string>();

export function lsGet(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    return v ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function lsSet(key: string, value: string): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* memory only — the session still works, it just won't be remembered */
  }
}

export function lsRemove(key: string): void {
  memory.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to remove */
  }
}
