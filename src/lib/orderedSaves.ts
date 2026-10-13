import { useCallback, useRef } from 'react';

export type SaveResult = { error: string | null };

/**
 * Keeps rapid clicks on the same tile safe.
 *
 * - Saves for the same key run one after another, so the database always ends
 *   up with the state from the most recent click.
 * - If a save fails, the tile only rolls back when no newer click has happened
 *   since, and it rolls back to the last state the database actually confirmed
 *   (not whatever was on screen when that particular click happened).
 */
export function useOrderedSaves<T>() {
  const queues = useRef(new Map<string, Promise<unknown>>());
  const pending = useRef(new Map<string, number>());
  const latest = useRef(new Map<string, number>());
  const confirmed = useRef(new Map<string, T>());
  const counter = useRef(0);

  return useCallback(async (
    key: string,
    before: T,
    next: T,
    save: () => Promise<SaveResult>,
    rollback: (state: T) => void,
  ): Promise<SaveResult> => {
    // With nothing in flight, what is on screen is what the database has.
    if (!pending.current.get(key)) confirmed.current.set(key, before);
    pending.current.set(key, (pending.current.get(key) ?? 0) + 1);
    const id = ++counter.current;
    latest.current.set(key, id);

    const run = (queues.current.get(key) ?? Promise.resolve()).then(save);
    queues.current.set(key, run.catch(() => undefined));

    let result: SaveResult;
    try {
      result = await run;
    } catch (caught) {
      result = { error: caught instanceof Error ? caught.message : 'Save failed.' };
    }

    const stillPending = (pending.current.get(key) ?? 1) - 1;
    if (stillPending > 0) {
      pending.current.set(key, stillPending);
    } else {
      pending.current.delete(key);
      queues.current.delete(key);
    }

    if (!result.error) {
      confirmed.current.set(key, next);
    } else if (latest.current.get(key) === id) {
      rollback(confirmed.current.get(key) ?? before);
    }

    return result;
  }, []);
}
