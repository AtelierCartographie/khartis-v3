<script lang="ts">
  import { KEY } from '$lib/features/commons/constants/dom.constants';
  import VariableBadge from '$lib/features/commons/components/variable-badge.svelte';
  import type { VariableBadgeType } from '$lib/features/commons/types/variable-badge.types';
  import type { VizSuggestion } from '$lib/features/commons/services/viz-suggester.service';
  import TilePreview from '$lib/features/commons/components/tile-preview.svelte';
  import * as m from '$lib/paraglide/messages';
  import { RadioButton } from 'carbon-components-svelte';
  import clsx from 'clsx';

  interface Props {
    suggestion: VizSuggestion;
    selected?: boolean;
    disabled?: boolean;
    resolveBadgeType: (columnName: string) => VariableBadgeType;
    activate?: () => void;
    onclick?: () => void;
    onClick?: () => void;
  }

  let {
    suggestion,
    selected = false,
    disabled = false,
    resolveBadgeType,
    activate,
    onclick,
    onClick
  }: Props = $props();

  const columns = $derived(suggestion.columns ?? []);
  const visibleColumns = $derived(columns.slice(0, 2));
  const extraColumnsCount = $derived(Math.max(0, columns.length - 1));
  const showCollection = $derived(suggestion.nbColumns > 2);
  const cardClasses = $derived(
    clsx('viz-suggestion-card', {
      selected,
      disabled
    })
  );

  function getSemioTypeLabel(semioType: string): string {
    const labels: Record<string, () => string> = {
      QTA: m.semio_label_QTA,
      QTR: m.semio_label_QTR,
      QL: m.semio_label_QL,
      QLO: m.semio_label_QLO
    };

    return labels[semioType]?.() ?? semioType;
  }

  function handleActivate() {
    if (!disabled) {
      (activate ?? onclick ?? onClick)?.();
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!disabled && (event.key === KEY.ENTER || event.key === KEY.SPACE)) {
      event.preventDefault();
      handleActivate();
    }
  }

  function handleRadioClick(event: Event) {
    event.preventDefault();
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
    <TilePreview
      ratio="1:1"
      label={m.viz_preview_label()}
      theme="suggestion"
      icon="palette"
    />
  </div>

  <div class="content-panel">
    <div class="header">
      <p class="title">{suggestion.label}</p>

      <div class="radio-wrapper kh-card-radio">
        <RadioButton
          checked={selected}
          disabled={disabled}
          labelText={suggestion.label}
          hideLabel
          onclick={handleRadioClick}
        />
      </div>
    </div>

    <div class="details">
      {#if visibleColumns.length > 0}
        {#each visibleColumns as columnName, idx (columnName)}
          <div class="detail-row">
            {#if suggestion.semioTypes[idx]}
              <p class="type-label">
                {getSemioTypeLabel(suggestion.semioTypes[idx])}
              </p>
            {/if}

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
                label={columnName}
                type={resolveBadgeType(columnName)}
                interactive={false}
              />

              {#if columns.length > 2 && idx === 0}
                <span class="overflow-chip">+ {extraColumnsCount}</span>
              {/if}
            </div>
          </div>
        {/each}
      {:else}
        <div class="detail-row detail-row--empty">
          <span class="empty-label">{m.no_variable()}</span>
        </div>
      {/if}
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
    padding: 1px;
    box-sizing: border-box;
    --tile-preview-background: var(
      --khartis-additions-layer-02-suggestions,
      #ffffff
    );
    --tile-preview-color: var(
      --khartis-additions-interactive-suggestions,
      #0072c3
    );
  }

  .viz-suggestion-card:hover:not(.disabled) .preview-panel {
    --tile-preview-background: var(
      --khartis-additions-layer-hover-01-suggestions,
      #cceeff
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

  .detail-row--empty {
    min-height: 2rem;
    justify-content: center;
  }

  .type-label,
  .empty-label {
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

  .overflow-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 18px;
    flex-shrink: 0;
    padding: 0 var(--cds-spacing-03);
    border-radius: 9px;
    background: var(--tag-background, #bae6ff);
    color: var(--tag-color, #00539a);
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    white-space: nowrap;
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
