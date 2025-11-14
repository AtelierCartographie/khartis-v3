/**
 * Debounce utility - Delays function execution until after wait milliseconds
 * have elapsed since the last call
 *
 * @param func - Function to debounce
 * @param wait - Milliseconds to wait before executing
 * @returns Debounced function with cancel method
 *
 * @example
 * const debouncedSearch = debounce((query: string) => {
 *   performSearch(query);
 * }, 300);
 *
 * // Only the last call within 300ms will execute
 * debouncedSearch('a');
 * debouncedSearch('ab');
 * debouncedSearch('abc'); // This one executes after 300ms
 *
 * // Cancel pending execution
 * debouncedSearch.cancel();
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = function (this: unknown, ...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func.apply(this, args);
      timeoutId = null;
    }, wait);
  } as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}

/**
 * Throttle utility - Ensures function is called at most once per wait period
 *
 * @param func - Function to throttle
 * @param wait - Minimum milliseconds between calls
 * @param options - Leading/trailing edge options
 * @returns Throttled function with cancel method
 *
 * @example
 * const throttledScroll = throttle((event: Event) => {
 *   handleScroll(event);
 * }, 100);
 *
 * window.addEventListener('scroll', throttledScroll);
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): T & { cancel: () => void } {
  const { leading = true, trailing = true } = options;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastCallTime = 0;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: unknown = null;

  const invokeFunc = () => {
    if (lastArgs !== null) {
      func.apply(lastThis, lastArgs);
      lastCallTime = Date.now();
      lastArgs = null;
      lastThis = null;
    }
  };

  const throttled = function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    lastArgs = args;
    lastThis = this;

    if (timeSinceLastCall >= wait) {
      // Enough time has passed, call immediately
      if (leading) {
        invokeFunc();
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      } else {
        // Leading edge disabled, schedule for later
        if (timeoutId === null && trailing) {
          timeoutId = setTimeout(() => {
            invokeFunc();
            timeoutId = null;
          }, wait);
        }
      }
    } else {
      // Not enough time passed, schedule for later
      if (timeoutId === null && trailing) {
        const remaining = wait - timeSinceLastCall;
        timeoutId = setTimeout(() => {
          invokeFunc();
          timeoutId = null;
        }, remaining);
      }
    }
  } as T & { cancel: () => void };

  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
    lastThis = null;
  };

  return throttled;
}
