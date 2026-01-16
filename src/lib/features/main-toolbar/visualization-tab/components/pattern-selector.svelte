<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Checkmark } from 'carbon-icons-svelte';
  import { PatternType } from '../../constants';

  interface Props {
    selectedPattern?: PatternType;
    patternColor?: string;
    onselect?: (pattern: PatternType) => void;
  }

  let {
    selectedPattern = PatternType.NONE,
    patternColor = '#4589ff',
    onselect
  }: Props = $props();

  const patterns: Array<{ type: PatternType; label: string }> = [
    { type: PatternType.NONE, label: 'pattern_none' },
    { type: PatternType.DIAGONAL, label: 'pattern_diagonal' },
    { type: PatternType.HORIZONTAL, label: 'pattern_horizontal' },
    { type: PatternType.VERTICAL, label: 'pattern_vertical' },
    { type: PatternType.DOTS, label: 'pattern_dots' },
    { type: PatternType.CROSS, label: 'pattern_cross' }
  ];

  function getPatternLabel(labelKey: string): string {
    const labels: Record<string, () => string> = {
      pattern_none: m.pattern_none,
      pattern_diagonal: m.pattern_diagonal,
      pattern_horizontal: m.pattern_horizontal,
      pattern_vertical: m.pattern_vertical,
      pattern_dots: m.pattern_dots,
      pattern_cross: m.pattern_cross
    };
    return labels[labelKey]?.() ?? labelKey;
  }

  function handleSelect(pattern: PatternType) {
    onselect?.(pattern);
  }
</script>

<div class="pattern-selector">
  <span class="field-label">{m.pattern()}</span>
  <div class="pattern-grid">
    {#each patterns as pattern (pattern.type)}
      <button
        type="button"
        class="pattern-item"
        class:selected={selectedPattern === pattern.type}
        onclick={() => handleSelect(pattern.type)}
        aria-label={getPatternLabel(pattern.label)}
        title={getPatternLabel(pattern.label)}
      >
        <svg
          class="pattern-preview"
          viewBox="0 0 40 40"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {#if pattern.type === PatternType.DIAGONAL}
              <pattern
                id="pattern-diagonal-{pattern.type}"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="8"
                  stroke={patternColor}
                  stroke-width="2"
                />
              </pattern>
            {:else if pattern.type === PatternType.HORIZONTAL}
              <pattern
                id="pattern-horizontal-{pattern.type}"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
              >
                <line
                  x1="0"
                  y1="4"
                  x2="8"
                  y2="4"
                  stroke={patternColor}
                  stroke-width="2"
                />
              </pattern>
            {:else if pattern.type === PatternType.VERTICAL}
              <pattern
                id="pattern-vertical-{pattern.type}"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
              >
                <line
                  x1="4"
                  y1="0"
                  x2="4"
                  y2="8"
                  stroke={patternColor}
                  stroke-width="2"
                />
              </pattern>
            {:else if pattern.type === PatternType.DOTS}
              <pattern
                id="pattern-dots-{pattern.type}"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="4" cy="4" r="2" fill={patternColor} />
              </pattern>
            {:else if pattern.type === PatternType.CROSS}
              <pattern
                id="pattern-cross-{pattern.type}"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
              >
                <line
                  x1="0"
                  y1="4"
                  x2="8"
                  y2="4"
                  stroke={patternColor}
                  stroke-width="1.5"
                />
                <line
                  x1="4"
                  y1="0"
                  x2="4"
                  y2="8"
                  stroke={patternColor}
                  stroke-width="1.5"
                />
              </pattern>
            {/if}
          </defs>
          <rect
            width="40"
            height="40"
            fill={pattern.type === PatternType.NONE
              ? patternColor
              : `url(#pattern-${pattern.type}-${pattern.type})`}
            rx="2"
          />
        </svg>
        {#if selectedPattern === pattern.type}
          <div class="check-icon">
            <Checkmark size={16} />
          </div>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style lang="scss">
  .pattern-selector {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .pattern-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--cds-spacing-03);
  }

  .pattern-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    aspect-ratio: 1;
    padding: var(--cds-spacing-02);
    background: var(--cds-field);
    border: 2px solid var(--cds-border-subtle);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      border-color: var(--cds-border-strong);
      background: var(--cds-field-hover);
    }

    &.selected {
      border-color: var(--cds-interactive);
      background: var(--cds-layer-selected);
    }
  }

  .pattern-preview {
    width: 100%;
    height: 100%;
    border-radius: 2px;
    overflow: hidden;
  }

  .check-icon {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    background: var(--cds-interactive);
    border-radius: 50%;
    color: white;
  }
</style>
