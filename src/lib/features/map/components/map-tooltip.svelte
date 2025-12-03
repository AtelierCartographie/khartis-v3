<script lang="ts">
  import * as m from '$lib/paraglide/messages';

  interface TooltipProps {
    x: number;
    y: number;
    data: Record<string, unknown> | null;
    visualizationVariables?: string[];
  }

  let { x, y, data, visualizationVariables = [] }: TooltipProps = $props();

  const MAX_ATTRIBUTES = 10;

  const primaryData = $derived.by(() => {
    if (!data) return [];
    return Object.entries(data).filter(([key]) =>
      visualizationVariables.includes(key)
    );
  });

  const allSecondaryData = $derived.by(() => {
    if (!data) return [];
    return Object.entries(data).filter(
      ([key]) =>
        !visualizationVariables.includes(key) &&
        key !== 'geometry' &&
        key !== 'geom' &&
        key !== '__id'
    );
  });

  const secondaryData = $derived(
    allSecondaryData.slice(0, MAX_ATTRIBUTES - primaryData.length)
  );

  const hiddenCount = $derived(
    Math.max(0, allSecondaryData.length - (MAX_ATTRIBUTES - primaryData.length))
  );

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return value.toLocaleString('fr-FR');
      }
      return value.toLocaleString('fr-FR', {
        maximumFractionDigits: 2
      });
    }
    const str = String(value);
    return str.length > 30 ? str.slice(0, 27) + '...' : str;
  }

  const tooltipStyle = $derived.by(() => {
    const viewportWidth =
      typeof window !== 'undefined' ? window.innerWidth : 1920;
    const viewportHeight =
      typeof window !== 'undefined' ? window.innerHeight : 1080;
    const tooltipWidth = 280;
    const tooltipHeight = 320;
    const offset = 15;

    let left = x + offset;
    let top = y + offset;

    if (left + tooltipWidth > viewportWidth - 20) {
      left = x - tooltipWidth - offset;
    }
    if (top + tooltipHeight > viewportHeight - 20) {
      top = y - tooltipHeight - offset;
    }
    if (left < 20) left = 20;
    if (top < 20) top = 20;

    return `left: ${left}px; top: ${top}px;`;
  });
</script>

{#if data && (primaryData.length > 0 || secondaryData.length > 0)}
  <div
    class="map-tooltip"
    style={tooltipStyle}
    role="tooltip"
    aria-live="polite"
  >
    {#if primaryData.length > 0}
      <div class="tooltip-section primary">
        {#each primaryData as [key, value] (key)}
          <div class="tooltip-row">
            <span class="tooltip-label" title={key}>{key}</span>
            <span class="tooltip-value primary-value" title={String(value)}
              >{formatValue(value)}</span
            >
          </div>
        {/each}
      </div>
    {/if}

    {#if secondaryData.length > 0}
      <div class="tooltip-section secondary">
        {#each secondaryData as [key, value] (key)}
          <div class="tooltip-row">
            <span class="tooltip-label" title={key}>{key}</span>
            <span class="tooltip-value" title={String(value)}
              >{formatValue(value)}</span
            >
          </div>
        {/each}
        {#if hiddenCount > 0}
          <div class="tooltip-more">
            {m.tooltip_and_more({ count: hiddenCount })}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .map-tooltip {
    position: fixed;
    pointer-events: none;
    background: var(--cds-ui-01, white);
    border: 1px solid var(--cds-border-strong, #8d8d8d);
    border-radius: 2px;
    padding: 0.75rem;
    width: 280px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 9999;
    font-size: 0.75rem;
  }

  .tooltip-section {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .tooltip-section.primary {
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--cds-border-subtle, #e0e0e0);
  }

  .tooltip-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.25rem;
  }

  .tooltip-label {
    color: var(--cds-text-02, #525252);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 0 1 auto;
    max-width: 130px;
  }

  .tooltip-value {
    color: var(--cds-text-01, #161616);
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 0 0 auto;
    max-width: 130px;
  }

  .tooltip-value.primary-value {
    font-weight: 600;
    color: var(--cds-interactive-01, #0f62fe);
  }

  .tooltip-more {
    color: var(--cds-text-02, #525252);
    font-style: italic;
    margin-top: 0.25rem;
    font-size: 0.6875rem;
  }
</style>
