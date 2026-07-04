<script lang="ts">
  import { KEY } from '$lib/features/commons/constants/dom.constants';
  import VariableBadge from '$lib/features/commons/components/variable-badge.svelte';
  import type { VariableBadgeType } from '$lib/features/commons/types/variable-badge.types';
  import type { VizSuggestion } from '$lib/features/commons/services/viz-suggester.service';
  import * as m from '$lib/paraglide/messages';
  import SimpleRadio from '$lib/features/commons/components/simple-radio.svelte';
  import clsx from 'clsx';
  import VisualizationSuggestionPreview from './visualization-suggestion-preview.svelte';

  interface Props {
    suggestion: VizSuggestion;
    selected?: boolean;
    disabled?: boolean;
    resolveBadgeType: (columnName: string) => VariableBadgeType;
    activate?: () => void;
  }

  let {
    suggestion,
    selected = false,
    disabled = false,
    resolveBadgeType,
    activate
  }: Props = $props();

  const displayRows = $derived(buildDisplayRows(suggestion));
  const showCollection = $derived(suggestion.nbColumns > 2);
  const primitiveLabel = $derived(getPrimitiveLabel(suggestion));
  const cardClasses = $derived(
    clsx('viz-suggestion-card', {
      selected,
      disabled
    })
  );

  function getModeLabel(semioType: string): string {
    const labels: Record<string, () => string> = {
      QTA: m.viz_suggestion_mode_proportional,
      QTR: m.viz_suggestion_mode_classes,
      QL: m.viz_suggestion_mode_categories,
      QLO: m.viz_suggestion_mode_categories
    };

    return labels[semioType]?.() ?? semioType;
  }

  function getPrimitiveLabel(suggestion: VizSuggestion): string {
    if ((suggestion.id ?? '').startsWith('texts_')) {
      return m.viz_suggestion_primitive_texts();
    }

    const geometries = suggestion.geometries ?? [];
    if (geometries.includes('point')) {
      return m.viz_suggestion_primitive_symbols();
    }
    if (geometries.includes('line')) {
      return m.viz_suggestion_primitive_lines();
    }
    return m.viz_suggestion_primitive_polygons();
  }

  function getFondLabel(semioType: string): string {
    if (semioType === 'QTR') {
      return m.viz_suggestion_mode_fond_classes();
    }
    return m.viz_suggestion_mode_fond_categories();
  }

  interface DisplayRow {
    typeLabel: string | null;
    variable: string | null;
  }

  function buildDisplayRows(suggestion: VizSuggestion): DisplayRow[] {
    const id = suggestion.id ?? '';
    const columns = suggestion.columns ?? [];
    const semioTypes = suggestion.semioTypes ?? [];
    const geometries = suggestion.geometries ?? [];
    const rows: DisplayRow[] = [];

    if (id.startsWith('texts_')) {
      columns.forEach((columnName, index) => {
        rows.push({
          typeLabel: index === 0 ? null : getModeLabel(semioTypes[index]),
          variable: columnName
        });
      });
      return rows;
    }

    if (geometries.includes('point')) {
      const isPolygonData = suggestion.dataGeometry === 'polygon';
      if (!semioTypes.includes('QTA')) {
        rows.push({
          typeLabel: m.viz_suggestion_mode_unique(),
          variable: null
        });
      }
      columns.forEach((columnName, index) => {
        const semioType = semioTypes[index];
        if (semioType === 'QTA') {
          rows.push({
            typeLabel: m.viz_suggestion_mode_proportional(),
            variable: columnName
          });
        } else {
          rows.push({
            typeLabel: isPolygonData
              ? getFondLabel(semioType)
              : getModeLabel(semioType),
            variable: columnName
          });
        }
      });
      return rows;
    }

    if (columns.length === 0) {
      rows.push({ typeLabel: m.viz_suggestion_mode_unique(), variable: null });
      return rows;
    }

    columns.forEach((columnName, index) => {
      rows.push({
        typeLabel: getModeLabel(semioTypes[index]),
        variable: columnName
      });
    });
    return rows;
  }

  function handleActivate() {
    if (!disabled) {
      activate?.();
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!disabled && (event.key === KEY.ENTER || event.key === KEY.SPACE)) {
      event.preventDefault();
      handleActivate();
    }
  }
</script>

<div
  class={cardClasses}
  role="radio"
  tabindex={disabled ? -1 : 0}
  aria-checked={selected}
  aria-disabled={disabled}
  onclick={handleActivate}
  onkeydown={handleKeyDown}
>
  <div class="preview-panel">
    <VisualizationSuggestionPreview
      suggestionId={suggestion.id}
      label={m.viz_preview_label()}
      semioTypes={suggestion.semioTypes}
      geometries={suggestion.geometries}
    />
  </div>

  <div class="content-panel">
    <div class="header">
      <p class="title">{primitiveLabel}</p>

      <div class="radio-wrapper kh-card-radio">
        <SimpleRadio
          checked={selected}
          disabled={disabled}
          labelText={suggestion.label}
          hideLabel
          variant="suggestions"
        />
      </div>
    </div>

    <div class="details">
      {#each displayRows as row, idx (`${row.variable ?? 'mode'}-${idx}`)}
        <div class="detail-row">
          {#if row.typeLabel}
            <p class="type-label">{row.typeLabel}</p>
          {/if}

          {#if row.variable}
            <div class="variable-row">
              <span class="variable-arrow" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 2V10H12"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>

              <VariableBadge
                label={row.variable}
                type={resolveBadgeType(row.variable)}
                interactive={false}
              />
            </div>
          {/if}
        </div>
      {/each}
    </div>

    {#if showCollection}
      <div class="collection-row">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect
            x="1"
            y="1"
            width="6"
            height="6"
            stroke="currentColor"
            stroke-width="1"
          />
          <rect
            x="9"
            y="1"
            width="6"
            height="6"
            stroke="currentColor"
            stroke-width="1"
          />
          <rect
            x="1"
            y="9"
            width="6"
            height="6"
            stroke="currentColor"
            stroke-width="1"
          />
          <rect
            x="9"
            y="9"
            width="6"
            height="6"
            stroke="currentColor"
            stroke-width="1"
          />
        </svg>

        <span>{m.map_collection()}</span>
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  .viz-suggestion-card {
    --viz-card-background: var(
      --khartis-additions-layer-01-suggestions,
      #e5f6ff
    );
    --viz-card-border-color: var(
      --khartis-additions-border-tile-01-suggestions,
      #82cfff
    );
    --viz-card-border-width: 1px;
    --viz-card-focus-color: var(--khartis-additions-focus-suggestions, #0072c3);
    --kh-card-radio-color: var(
      --khartis-additions-text-primary-suggestions,
      #003a6d
    );
    --kh-card-radio-disabled-color: var(
      --khartis-additions-icon-disabled-suggestions,
      rgba(0, 58, 109, 0.25)
    );
    --kh-card-radio-focus-color: var(--viz-card-focus-color);
    display: flex;
    align-items: stretch;
    min-height: 120px;
    border: var(--viz-card-border-width) solid var(--viz-card-border-color);
    background: var(--viz-card-background);
    box-sizing: border-box;
    cursor: pointer;
    outline: none;
  }

  .viz-suggestion-card.selected {
    --viz-card-border-width: 4px;
    --viz-card-border-color: var(--viz-card-focus-color);
  }

  .viz-suggestion-card.disabled {
    cursor: default;
    opacity: 0.5;
  }

  .viz-suggestion-card:hover:not(.disabled) {
    --viz-card-background: var(
      --khartis-additions-layer-hover-01-suggestions,
      #cceeff
    );
  }

  .viz-suggestion-card:focus-visible {
    outline: 2px solid var(--viz-card-focus-color);
    outline-offset: 0;
  }

  .preview-panel {
    width: 120px;
    min-width: 120px;
    min-height: 120px;
    flex: 0 0 120px;
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1px;
    box-sizing: border-box;
    background: #ffffff;
    --tile-preview-background: var(
      --khartis-additions-layer-02-suggestions,
      #ffffff
    );
    --tile-preview-color: var(
      --khartis-additions-interactive-suggestions,
      #0072c3
    );
  }

  .content-panel {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    padding: var(--cds-spacing-05);
    background: var(--viz-card-background);
    box-sizing: border-box;
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--cds-spacing-03);
    margin-bottom: var(--cds-spacing-02);
  }

  .title {
    margin: 0;
    flex: 1 1 auto;
    min-width: 0;
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
    overflow-wrap: break-word;
  }

  .radio-wrapper {
    flex-shrink: 0;
    padding-right: var(--cds-spacing-02);
  }

  .details {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .detail-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .type-label {
    margin: 0;
    color: var(--khartis-additions-text-secondary-suggestions, #00539a);
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
  }

  .variable-row {
    display: flex;
    align-items: flex-end;
    gap: var(--cds-spacing-02);
    min-width: 0;
  }

  .variable-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--khartis-additions-text-secondary-suggestions, #00539a);
  }

  .variable-row :global(.variable-badge) {
    min-width: 0;
  }

  .collection-row {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    margin-top: auto;
    padding-top: var(--cds-spacing-02);
    color: var(--khartis-additions-text-helper-suggestions, #0072c3);
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
  }
</style>
