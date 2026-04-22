/**
 * Timing constants for map interactions and animations.
 *
 * These values are based on UX research:
 * - Users perceive delays < 100ms as instantaneous
 * - Delays between 100-300ms feel responsive
 * - Delays > 300ms should provide visual feedback
 *
 * References:
 * - Nielsen Norman Group response time guidelines
 * - Google RAIL performance model
 */
export const MAP_TIMING = {
  /**
   * Debounce delay for fitBounds operations.
   * Set to 300ms as users perceive < 350ms as nearly instantaneous,
   * while allowing time to batch rapid consecutive bounds changes.
   */
  FITBOUNDS_DEBOUNCE_MS: 300,

  /**
   * Standard duration for zoom animations.
   * 450ms provides smooth visual feedback without feeling sluggish.
   * Matches MapLibre's default animation duration.
   */
  ZOOM_ANIMATION_MS: 450,

  /**
   * Padding around the map when fitting bounds (in pixels).
   * Ensures content is not clipped at edges.
   */
  FITBOUNDS_PADDING_PX: 50,

  /**
   * Delay before showing tooltips on hover.
   * Prevents flicker during rapid mouse movement.
   */
  TOOLTIP_DELAY_MS: 100
} as const;
