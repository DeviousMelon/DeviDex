import { useEffect, useState } from 'react';

/** The current time, refreshed every `intervalMs`. Pauses while the tab is hidden. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: number | undefined;
    const tick = () => setNow(Date.now());
    const start = () => {
      window.clearInterval(timer);
      tick();
      timer = window.setInterval(tick, intervalMs);
    };
    const onVisibility = () => (document.hidden ? window.clearInterval(timer) : start());

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return now;
}
