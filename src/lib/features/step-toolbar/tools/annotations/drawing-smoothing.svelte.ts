const SMOOTHING_SETTLE_MS = 600;

let adjusting = $state(false);
let pointerHeld = false;
let settleTimer: ReturnType<typeof setTimeout> | null = null;

function clearSettleTimer(): void {
  if (settleTimer) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
}

function scheduleSettle(): void {
  clearSettleTimer();
  settleTimer = setTimeout(() => {
    settleTimer = null;
    adjusting = false;
  }, SMOOTHING_SETTLE_MS);
}

/**
 * Whether the user is adjusting a drawing's smoothing: the map hides the
 * anchors meanwhile, since they sit on the raw points, off the smoothed path.
 */
export const drawingSmoothing = {
  get adjusting(): boolean {
    return adjusting;
  },
  pointerDown(): void {
    pointerHeld = true;
    clearSettleTimer();
    adjusting = true;
  },
  pointerUp(): void {
    if (!pointerHeld) return;
    pointerHeld = false;
    scheduleSettle();
  },
  changed(): void {
    adjusting = true;
    if (!pointerHeld) {
      scheduleSettle();
    }
  },
  reset(): void {
    pointerHeld = false;
    clearSettleTimer();
    adjusting = false;
  }
};
