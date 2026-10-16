import { useEffect, useState } from 'react';

/**
 * Runs an async loader and tracks loading/error state. Pass every value the
 * loader reads in `deps`. Stale results from an earlier run are ignored.
 */
export function useReference<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    load()
      .then((result) => { if (active) setData(result); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Something went wrong.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading };
}
