<script lang="ts">
  import { Accordion, AccordionItem } from 'carbon-components-svelte';

  interface TooltipProps {
    x: number;
    y: number;
    data: Record<string, any> | null;
    visualizationVariables?: string[];
  }

  let { x, y, data, visualizationVariables = [] }: TooltipProps = $props();

  const primaryData = $derived.by(() => {
    if (!data) return [];
    return Object.entries(data).filter(([key]) =>
      visualizationVariables.includes(key)
    );
  });

  const secondaryData = $derived.by(() => {
    if (!data) return [];
    return Object.entries(data).filter(
      ([key]) =>
        !visualizationVariables.includes(key) &&
        key !== 'geometry' &&
        key !== 'geom' &&
        key !== '__id'
    );
  });

  function formatValue(value: any): string {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'number') {
      return value.toLocaleString('fr-FR', {
        maximumFractionDigits: 2
      });
    }
    return String(value);
  }
</script>

{#if data}
  <div
    class="map-tooltip"
    style:left="{x + 10}px"
    style:top="{y + 10}px"
    role="tooltip"
    aria-live="polite"
  >
    {#if primaryData.length > 0}
      <div class="tooltip-section primary">
        {#each primaryData as [key, value]}
          <div class="tooltip-row">
            <span class="tooltip-label">{key}:</span>
            <span class="tooltip-value primary-value">{formatValue(value)}</span
            >
          </div>
        {/each}
      </div>
    {/if}

    {#if secondaryData.length > 0}
      <Accordion size="sm">
        <AccordionItem title="Autres attributs" open={false}>
          <div class="tooltip-section secondary">
            {#each secondaryData as [key, value]}
              <div class="tooltip-row">
                <span class="tooltip-label">{key}:</span>
                <span class="tooltip-value">{formatValue(value)}</span>
              </div>
            {/each}
          </div>
        </AccordionItem>
      </Accordion>
    {/if}
  </div>
{/if}

<style>
  .map-tooltip {
    position: fixed;
    pointer-events: none;
    background: white;
    border: 2px solid #0f62fe;
    border-radius: 4px;
    padding: 0.75rem;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 9999;
    font-size: 0.875rem;
  }

  .tooltip-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tooltip-section.primary {
    margin-bottom: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--cds-border-subtle);
  }

  .tooltip-section.secondary {
    max-height: 200px;
    overflow-y: auto;
  }

  .tooltip-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .tooltip-label {
    color: #525252;
    font-weight: 600;
    white-space: nowrap;
  }

  .tooltip-value {
    color: #161616;
    text-align: right;
    word-break: break-word;
  }

  .tooltip-value.primary-value {
    font-weight: 700;
    color: #0f62fe;
  }
</style>
