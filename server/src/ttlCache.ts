interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export function createTtlCache<T>(ttlMs: number, maxEntries: number) {
  const entries = new Map<string, CacheEntry<T>>();

  return {
    get(key: string): T | undefined {
      const entry = entries.get(key);
      if (!entry) {
        return undefined;
      }
      if (Date.now() >= entry.expiresAt) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T): void {
      // WHY: The size cap ensures bounded memory on a public endpoint.
      if (!entries.has(key) && entries.size >= maxEntries) {
        for (const oldestKey of entries.keys()) {
          entries.delete(oldestKey);
          break;
        }
      }
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    clear(): void {
      entries.clear();
    },
  };
}
