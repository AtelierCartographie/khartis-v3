<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { TextInput } from 'carbon-components-svelte';
  import { CaretRight, Information } from 'carbon-icons-svelte';
  import type { ShapeType } from '$lib/features/commons/constants/visualization.constants';

  interface ClassBreak {
    min: number;
    max: number;
    count: number;
    color: string;
  }

  interface SizePreview {
    shape: ShapeType;
    minSize: number;
    maxSize: number;
  }

  interface Props {
    breaks: ClassBreak[];
    maxHistogramCount: number;
    sizePreview?: SizePreview;
    validationErrors: string[];
    canEditBreakRow: (index: number) => boolean;
    resolveHistogramColor: (breakItem: ClassBreak, index: number) => string;
    resolveSizePreviewStyle: (index: number) => string;
    onbreakvalueinput: (index: number, value: number) => void;
    onbreakblur: () => void;
  }

  let {
    breaks,
    maxHistogramCount,
    sizePreview,
    validationErrors,
    canEditBreakRow,
    resolveHistogramColor,
    resolveSizePreviewStyle,
    onbreakvalueinput,
    onbreakblur
  }: Props = $props();
</script>

<div class="section histogram-section">
  <p class="section-label">{m.discretization_value_distribution()}</p>
  <div class="histogram-rows">
    {#each breaks as breakItem, index (index)}
      {@const widthPercent = (breakItem.count / maxHistogramCount) * 100}
      {@const histogramColor = resolveHistogramColor(breakItem, index)}
      <div class="histogram-row">
        <div class="histogram-label">
          {#if index === 0}{m.discretization_min_abbrev()}{/if}
        </div>
        <div class="histogram-input-wrapper">
          <TextInput
            id="break-value-{index}"
            size="sm"
            hideLabel
            labelText={m.filters_value_min()}
            disabled={!canEditBreakRow(index)}
            value={String(breakItem.min)}
            on:input={(e) => {
              const value = Number(e.detail);
              if (Number.isFinite(value)) {
                onbreakvalueinput(index, value);
              }
            }}
            on:blur={onbreakblur}
          />
        </div>
        <div class="histogram-caret">
          <CaretRight size={16} />
        </div>
        {#if sizePreview}
          <div
            class="break-preview"
            data-shape={sizePreview.shape}
            style={resolveSizePreviewStyle(index)}
          ></div>
        {/if}
        <div class="histogram-bar-wrapper">
          <div
            class="histogram-bar"
            style="width: {widthPercent}%; background-color: {histogramColor}"
            title="{breakItem.min} - {breakItem.max}: {breakItem.count} {m.discretization_values()}"
          ></div>
        </div>
      </div>
    {/each}
    <div class="histogram-row">
      <div class="histogram-label">{m.discretization_max_abbrev()}</div>
      <div class="histogram-input-wrapper">
        <TextInput
          id="break-value-{breaks.length}"
          size="sm"
          hideLabel
          labelText={m.filters_value_max()}
          disabled
          value={String(breaks[breaks.length - 1]?.max ?? '')}
        />
      </div>
      <div class="histogram-caret">
        <CaretRight size={16} />
      </div>
      <div class="histogram-bar-wrapper"></div>
    </div>
  </div>

  {#if validationErrors.length > 0}
    <div class="validation-errors">
      {#each validationErrors as error (error)}
        <div class="validation-error">
          <Information size={16} />
          <span>{error}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .section {
    margin-bottom: var(--cds-spacing-05);
  }

  .section-label {
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
    font-weight: 400;
    margin-bottom: var(--cds-spacing-03);
  }

  .histogram-rows {
    display: flex;
    flex-direction: column;
  }

  .histogram-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    min-height: 32px;
  }

  .histogram-label {
    width: 27px;
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
    flex-shrink: 0;
  }

  .histogram-input-wrapper {
    flex: 1;
    min-width: 64px;
  }

  .histogram-input-wrapper :global(.bx--form-item) {
    flex: none;
  }

  .histogram-input-wrapper :global(.bx--text-input) {
    background-color: transparent;
    border-bottom: 1px solid var(--cds-border-subtle, #e0e0e0);
    text-align: right;
    color: var(--cds-text-secondary, #525252);
  }

  .histogram-input-wrapper :global(.bx--text-input:disabled) {
    background-color: transparent;
    border-bottom: 1px solid var(--cds-border-subtle, #e0e0e0);
    color: var(--cds-text-secondary, #525252);
    -webkit-text-fill-color: var(--cds-text-secondary, #525252);
  }

  .histogram-caret {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--cds-icon-primary, #161616);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .break-preview {
    width: var(--preview-size);
    height: var(--preview-size);
    max-width: 28px;
    max-height: 28px;
    min-width: 4px;
    min-height: 4px;
    flex-shrink: 0;
    background: var(--cds-icon-primary, #161616);
  }

  .break-preview[data-shape='circle'] {
    border-radius: 50%;
  }

  .break-preview[data-shape='triangle'] {
    width: 0;
    height: 0;
    background: transparent;
    border-left: calc(var(--preview-size) / 2) solid transparent;
    border-right: calc(var(--preview-size) / 2) solid transparent;
    border-bottom: var(--preview-size) solid var(--cds-icon-primary, #161616);
  }

  .break-preview[data-shape='bar'],
  .break-preview[data-shape='spike'],
  .break-preview[data-shape='line'] {
    width: calc(var(--preview-size) * 0.45);
    height: var(--preview-size);
  }

  .histogram-bar-wrapper {
    width: 128px;
    height: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .histogram-bar {
    height: 100%;
    min-width: 2px;
  }

  .validation-errors {
    margin-top: var(--cds-spacing-03);
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .validation-error {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    color: var(--cds-support-error);
    font-size: 0.75rem;
    padding: var(--cds-spacing-02);
    background: var(--cds-notification-error-background, #fff1f1);
    border-radius: 4px;
  }
</style>
