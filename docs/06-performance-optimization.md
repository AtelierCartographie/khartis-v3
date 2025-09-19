# Performance Optimization

## Goals

- Deliver a fast, smooth experience across a wide range of devices and browsers.
- Keep heavy operations responsive with progressive feedback.
- Respect performance budgets and avoid regressions via monitoring.

## Loading and bundling

- Code splitting with on-demand loading for heavy libraries (DuckDB, Deck.gl) and routes.
- Tree-shaking and minification remove unused code.
- Preload critical CSS, fonts, and small icons to reduce first paint.
- Use modern image formats and responsive images for thumbnails and previews.

## Perceived performance

- Skeleton screens from the design system are shown while loading tables, initializing map layers, and preparing exports.
- Optimistic UI where appropriate, with immediate visual feedback to parameter changes.
- Debounced updates for sliders and text fields reduce unnecessary re-renders.
- Non-blocking toasts and progress indicators inform about background work and completion.

## Data pipeline efficiency

- Stream and paginate large tables; compute statistics incrementally.
- Use Web Workers for CPU-intensive tasks (joins, spatial transforms, classification).
- Share memory with transferable objects; avoid deep copies of large arrays and geometries.
- Cache intermediate results (typing, thresholds, palettes) for reuse between sessions.

## Rendering and interactions

- GPU instancing and attribute buffers minimize CPU-GPU transfers.
- Adaptive level of detail reduces geometric complexity at low zooms.
- Progressive rendering: simplified preview during interaction, refined rendering at rest.

- Memoized projections and geometry transforms; reuse tiles and textures across views.

## Network and storage

- Client-side confinement: imported data remains local.
- Service worker can cache static assets and projection catalogs for offline resilience.
- IndexedDB stores project versions, user preferences, and recent resources.
- Respect storage quotas; compact or purge caches when necessary.

## Budgets and targets

- JavaScript: cap initial bundle size and long tasks per interaction.
- Rendering: aim for 60 FPS for pan/zoom and transitions on mid-range devices.
- Memory: guardrails on dataset sizes with graceful degradation (sampling or simplified rendering) beyond thresholds.

## Observability and regression control

- Real-user metrics capture load times, interaction latency, and error rates.
- Automated checks (Lighthouse, Playwright) run in CI on critical journeys.
- Performance dashboards expose trends; alerts trigger when budgets are exceeded.

## Progressive enhancement and fallback

- Graceful degradation when WebGL, Workers, or advanced APIs are unavailable.
- Preserve essential functionality with reduced interactivity and simplified visuals.
- Clear user communication about limitations and suggested alternatives.
