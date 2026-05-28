<script lang="ts">
  import type { OfflineBasemapEntry } from '$lib/features/commons/stores/connectivity.store.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { Tag } from 'carbon-components-svelte';

  interface Props {
    basemapId: string;
    title: string;
    entry: OfflineBasemapEntry | undefined;
  }

  const { title, entry }: Props = $props();

  const status = $derived(entry?.status ?? 'unknown');

  const tagInfo = $derived(() => {
    switch (status) {
      case 'cached':
        return {
          type: 'green' as const,
          label: m.offline_panel_basemap_status_cached()
        };
      case 'downloading':
        return {
          type: 'cyan' as const,
          label: m.offline_panel_basemap_status_downloading()
        };
      case 'failed':
        return {
          type: 'red' as const,
          label: m.offline_panel_basemap_status_failed()
        };
      case 'evicted':
        return {
          type: 'warm-gray' as const,
          label: m.offline_panel_basemap_status_evicted()
        };
      default:
        return {
          type: 'gray' as const,
          label: m.offline_panel_basemap_status_pending()
        };
    }
  });
</script>

<div class="offline-basemap-row">
  <div class="row-info">
    <span class="row-title">{title}</span>
  </div>

  <div class="row-actions">
    <Tag type={tagInfo().type} size="sm">{tagInfo().label}</Tag>
  </div>
</div>

<style>
  .offline-basemap-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03) 0;
    border-bottom: 1px solid var(--cds-border-subtle);
  }

  .row-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .row-title {
    font-size: 0.875rem;
    color: var(--cds-text-01);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-actions {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    flex-shrink: 0;
  }
</style>
