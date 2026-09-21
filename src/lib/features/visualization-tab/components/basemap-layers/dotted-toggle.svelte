<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Dropdown } from 'carbon-components-svelte';
  import { ToggleWithLabel } from '../shared';
  import { BasemapDottedPattern } from '$lib/features/commons/constants/visualization.constants';

  interface PatternOption {
    id: BasemapDottedPattern;
    text: string;
  }

  interface Props {
    label?: string;
    enabled?: boolean;
    showPattern?: boolean;
    pattern?: BasemapDottedPattern;
    disabled?: boolean;
    disabledReason?: string;
    onenabledchange?: (enabled: boolean) => void;
    onpatternchange?: (pattern: BasemapDottedPattern) => void;
  }

  function getPatternOptions(): PatternOption[] {
    return [
      { id: BasemapDottedPattern.DOTS, text: m.basemap_config_pattern_dots() },
      {
        id: BasemapDottedPattern.DASHES,
        text: m.basemap_config_pattern_dashes()
      },
      {
        id: BasemapDottedPattern.DASH_DOT,
        text: m.basemap_config_pattern_dash_dot()
      },
      {
        id: BasemapDottedPattern.LONG_DASH,
        text: m.basemap_config_pattern_long_dash()
      }
    ];
  }

  let {
    label = m.basemap_config_dotted(),
    enabled = false,
    showPattern = false,
    pattern = BasemapDottedPattern.DOTS,
    disabled = false,
    disabledReason,
    onenabledchange,
    onpatternchange
  }: Props = $props();

  function handleToggle(next: boolean): void {
    onenabledchange?.(next);
  }

  function handlePatternChange(e: CustomEvent<{ selectedId: string }>) {
    onpatternchange?.(e.detail.selectedId as BasemapDottedPattern);
  }
</script>

<div class="dotted-toggle">
  <ToggleWithLabel
    label={label}
    toggled={enabled}
    disabled={disabled}
    ontoggle={handleToggle}
  />

  {#if showPattern && enabled}
    <div class="pattern-selector">
      <Dropdown
        size="sm"
        selectedId={pattern}
        items={getPatternOptions()}
        disabled={disabled}
        on:select={handlePatternChange}
      />
    </div>
  {/if}

  {#if disabled && disabledReason}
    <p class="disabled-reason">{disabledReason}</p>
  {/if}
</div>

<style lang="scss">
  .dotted-toggle {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-inline);
  }

  .pattern-selector {
    margin-top: calc(-1 * var(--cds-spacing-02));
  }

  .disabled-reason {
    font-size: 0.6875rem;
    line-height: 1rem;
    color: var(--cds-text-secondary);
    margin: 0;
  }
</style>
