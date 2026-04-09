<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { Dropdown } from 'carbon-components-svelte';
  import { BasemapDottedPattern } from '../../../constants';

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
  <div class="dotted-toggle-row">
    <span class="dotted-label">{label}</span>
    <Switch
      toggled={enabled}
      disabled={disabled}
      labelText={label}
      hideLabel
      labelA={m.option_non()}
      labelB={m.option_oui()}
      showStateLabel
      onchange={handleToggle}
    />
  </div>

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
    gap: var(--cds-spacing-03);
  }

  .dotted-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-03);
  }

  .dotted-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .pattern-selector {
    margin-top: var(--cds-spacing-02);
  }

  .disabled-reason {
    font-size: 0.6875rem;
    line-height: 1rem;
    color: var(--cds-text-secondary);
    margin: 0;
  }
</style>
