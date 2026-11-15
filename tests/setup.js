/* Shared test bootstrap: stub localStorage, then load logic modules onto globalThis. */
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k),
    clear: () => mem.clear()
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

await import('../js/utils.js');
await import('../js/storage.js');
await import('../js/store.js');
await import('../js/priority.js');
await import('../js/planner.js');
await import('../js/ai.js');
await import('../js/timer.js');
