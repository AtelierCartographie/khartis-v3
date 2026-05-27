---
paths:
  - 'src/lib/features/commons/services/classification.service.ts'
  - 'src/lib/features/commons/components/palette-popover/**'
  - 'src/lib/features/commons/utils/color-utils.ts'
  - 'src/lib/features/commons/constants/qualitative-palette.constants.ts'
  - 'src/lib/features/map/layers/pattern-texture.ts'
  - 'src/lib/features/step-toolbar/tools/color-blindness/**'
  - 'src/lib/features/visualization-tab/hooks/**'
---

# Color, classification & patterns

Color and discretization are the heart of thematic semiology. Palettes are generated in a **perceptual color space (OKLab/OKLCH) via `@ateliercartographie/ok-palette`** — don't bypass it with ad-hoc RGB/HSL interpolation.

## Three palette families, matched to the variable

- **Sequential** (`sequential`) — ordered quantitative data, light → dark.
- **Diverging** (`divergentSequential`) — quantitative data with a meaningful breakpoint; pass the diverging split (`hasCenterClass`) computed from the break position, don't fake it by reversing a sequential ramp.
- **Qualitative / categorical** — nominal categories, from the project presets (`qualitative-palette.constants.ts`).

Generate class colors through `generateColorsForBreaks()` in `classification.service.ts`; export to the renderer via `resolvePalette(..., { format: 'webgl' })` then `webglToHex`. Palette inversion is a flip of the resolved array, not a re-generation.

## Discretization follows the user, not a default

- Methods live in `ClassificationMethod` (equal interval, quantiles, k-means, q6, nested means, head/tail, **manual**) and map to DuckDB break macros via `mapMethodToMacro()`. Add new methods there, computed in DuckDB.
- Always honor the user's class count and any manually edited class bounds; `manual` performs no recompute — only counts per class.
- A **breakpoint** turns the ramp diverging (`calculateDivergingBreaks` / `computeDivergingSplit`); validate it with `Number.isFinite` and keep the frequency-histogram view in sync.
- Round class bounds to the data with the existing rounding step; don't surface raw floats as breaks.

## Color-blindness is first-class

- Every palette declares `colorBlindSafe`; respect it. Known unsafe diverging ramps (red-green like `rdylgn`, `piyg`) must not be presented as "safe", and the daltonism filter should prefer safe palettes / safe category subsets.
- The simulation tool (`color-blindness/`) only **previews** deficiencies (protanopia, deuteranopia, tritanopia, …) via CSS `feColorMatrix`; it must never alter exported colors.

## Custom color & intensity

Use `color-utils.ts` (`hslToHex`, `hexToHsl`, `createColorValue`) for the HSL↔hex round-trip; ranges are H 0–359, S/L 0–100. Keep hue/saturation/lightness and the hex value in sync through `ColorValue`.

## Patterns (`@ateliercartographie/motif.js`)

Fills can be patterns instead of flat color. Allowed angles are **0 / 45 / 315°**; map UI pattern names through `PATTERN_TYPE_MAP`, build the GPU atlas once (`pattern-texture.ts`), and reuse `motif(...).tile().toDataURL()` for CSS previews. Categorical/sequential pattern sets come from ok-palette and are color-blind safe by construction.

## Carbon inputs (Svelte 5 traps)

Color/classification UI uses Carbon, never native controls. Per `CLAUDE.md`: `<Slider>` use `on:input` only; debounce slider → DuckDB recompute (see `slider-with-input.svelte`, ~120 ms) so dragging doesn't spam classification queries. `<Checkbox>` / `<Toggle>` use `on:change` / `onchange`, not `bind:checked`.
