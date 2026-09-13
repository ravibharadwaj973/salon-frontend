'use client';

import { useEffect, useState } from 'react';

/**
 * The value, but only once it has stopped changing for `delay`.
 *
 * Used wherever typing drives a query. Without it every keystroke is a request,
 * and the answers arrive out of order — so the list flickers and can settle on
 * the results for a prefix of what the person actually typed.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
