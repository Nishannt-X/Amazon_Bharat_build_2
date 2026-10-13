/** Share one in-flight/cloud read per warm server, including empty/error results. */
export function createReportReadCache<T>(read: () => Promise<T | null>, ttlMs = 60000, now = Date.now) {
  let current: { promise: Promise<T | null>; expires: number } | undefined;
  return (): Promise<T | null> => {
    if (current && current.expires > now()) return current.promise;
    const entry = { promise: Promise.resolve(null) as Promise<T | null>, expires: Infinity };
    entry.promise = Promise.resolve().then(read).catch(() => null).then(value => {
      entry.expires = now() + ttlMs;
      return value;
    });
    current = entry;
    return entry.promise;
  };
}
