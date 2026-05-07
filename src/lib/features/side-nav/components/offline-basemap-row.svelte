<script lang="ts">
  import type { OfflineBasemapEntry } from '$lib/features/commons/stores/connectivity.store.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { Button, Tag } from 'carbon-components-svelte';
  import { Download, TrashCan } from 'carbon-icons-svelte';

  interface Props {
    basemapId: string;
    title: string;
    entry: OfflineBasemapEntry | undefined;
    onDownload: (basemapId: string) => void;
    onCancel: (basemapId: string) => void;
    onDelete: (basemapId: string) => void;
  }

  const { basemapId, title, entry, onDownload, onCancel, onDelete }: Props =
    $props();

  const status = $derived(entry?.status ?? 'unknown');

  const tagInfo = $derived(() => {
    switch (status) {
      case 'cached':
        return {
          type: 'blue' as const,
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
        return null;
    }
  });
</script>

<div class="offline-basemap-row">
  <div class="row-info">
    <span class="row-title">{title}</span>
    <span class="row-id">{basemapId}</span>
  </div>

  <div class="row-actions">
    {#if tagInfo()}
      {@const info = tagInfo()}
      {#if info}
        <Tag type={info.type} size="sm">{info.label}</Tag>
      {/if}
    {/if}

    {#if status === 'downloading'}
      <Button
        size="small"
        kind="ghost"
        on:click={() => onCancel(basemapId)}
        data-testid="offline-row-cancel"
      >
        {m.offline_panel_basemap_cancel()}
      </Button>
    {:else if status === 'cached'}
      <Button
        size="small"
        kind="danger-ghost"
        icon={TrashCan}
        iconDescription={m.offline_panel_basemap_delete()}
        tooltipPosition="left"
        on:click={() => onDelete(basemapId)}
        data-testid="offline-row-delete"
      />
    {:else}
      <Button
        size="small"
        kind="ghost"
        icon={Download}
        iconDescription={m.offline_panel_basemap_download()}
        tooltipPosition="left"
        on:click={() => onDownload(basemapId)}
        data-testid="offline-row-download"
      />
    {/if}
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
  }

  .row-id {
    font-size: 0.7rem;
    color: var(--cds-text-03);
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
