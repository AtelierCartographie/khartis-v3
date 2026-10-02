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

# Color, classification and patterns

Color and discretization are the heart of thematic semiology: a wrong break or palette changes how the map reads without raising any error. Palettes are generated in a perceptual color space (OKLab/OKLCH) through `@ateliercartographie/ok-palette`; ad-hoc RGB or HSL interpolation bypasses it. Reference: `docs/DISCRETISATION_ET_COULEURS.md`.

## Three palette families, matched to the variable

- **Sequential** (`sequential`): ordered quantitative data, light to dark.
- **Diverging** (`divergentSequential`): quantitative data with a meaningful breakpoint. Pass the diverging split (`hasCenterClass`) computed from the break position; reversing a sequential ramp does not produce one.
- **Qualitative**: nominal categories, from the project presets (`qualitative-palette.constants.ts`).

Generate class colors with `generateColorsForBreaks()` in `classification.service.ts`, and export them to the renderer with `resolvePalette(..., { format: 'webgl' })` then `webglToHex`. Inverting a palette flips the resolved array; it does not regenerate it.

## Discretization follows the user

- Methods live in `ClassificationMethod` (equal interval, quantiles, k-means, q6, nested means, head/tail, manual) and map to DuckDB break macros through `mapMethodToMacro()`. A new method is added there and computed in DuckDB.
- The user's class count and manually edited bounds are always honored. `manual` recomputes nothing except the counts per class.
- A breakpoint turns the ramp diverging (`calculateDivergingBreaks`, `computeDivergingSplit`). Validate it with `Number.isFinite` and keep the frequency histogram in sync.
- Class bounds are rounded to the data with the existing rounding step. Raw floats are not shown as breaks.

## Color-blindness

- Color-blind safety is a suggestion preset, not a filter. `SUGGESTION_PRESET.COLORBLIND` sits beside the other presets and proposes palettes from published work (Bang Wong, Paul Tol) in `colorblind-palette.constants.ts`. The user picks a color-blind-safe palette among the suggestions; no switch hides the other ones.
- Wong's black is excluded from the categorical scheme so that categories carry comparable visual weight.
- Any palette a preset or a dropdown can hand out has to resolve through `findPaletteById` (add it to `ADDRESSABLE_PALETTES`). An id that does not resolve makes `resolveClassificationColors` regenerate the default ramp and silently discard the user's choice.
- A hand-built ramp has no palette id. The color-sync path passes `preserveCustomColors` so it survives a refresh, while the break and breakpoint path still regenerates.
- The simulation tool (`color-blindness/`) only previews deficiencies through a CSS `feColorMatrix`. It never alters exported colors.

## Custom color and intensity

`color-utils.ts` (`hslToHex`, `hexToHsl`, `createColorValue`) handles the HSL to hex round trip, with H in 0..359 and S, L in 0..100. Hue, saturation, lightness and the hex value stay in sync through `ColorValue`.

## Patterns (`@ateliercartographie/motif.js` with ok-palette)

- A pattern palette replaces the flat fill (white background plus one motif per class); it is not an overlay.
- Class pattern sets come from ok-palette (`sequentialPatterns`, `categoricalPatterns`) through `resolveClassPatterns()` in `pattern-palette.service.ts`. Size and angle ramps are not hand-rolled.
- `PatternPaletteConfig.scale` is in native motif units: the design tile is scale × 10 CSS px, and the UI slider shows the ×10 value. Categorical pattern palettes are capped at `MAX_CATEGORICAL_PATTERN_COUNT`.
- Atlas frame widths scaled by `devicePixelRatio` are not fed to the Deck.gl shader, and previews are not built from `motif().tile()` (canvas tiles are DPR-scaled and unrotated). Use the SVG-defs helpers: `buildPatternSvgBackground`, `buildClassPatternSvgBackground`, the legend `patternFill`.
- The legacy single-motif model (`patternId`, `patternParams`, `PATTERN_TYPE_MAP`) remains only for unique fills, symbols and missing data.

## Carbon inputs

The Carbon event traps are listed in `svelte-carbon-ui.md`. One is specific to this area: debounce a slider before it triggers a DuckDB recompute (`slider-with-input.svelte`, about 120 ms), so that dragging does not flood classification queries.
