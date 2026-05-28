<script lang="ts">
  import {
    connectivityStore,
    type OfflineBasemapEntry
  } from '$lib/features/commons/stores/connectivity.store.svelte';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import {
    buildEssentialDownloadEntries,
    buildExtendedDownloadEntries,
    type BasemapDownloadEntry
  } from '$lib/features/commons/utils/offline-basemap-sets';
  import {
    cacheUrlsForOffline,
    prepareBasemapForOffline
  } from '$lib/features/commons/utils/pwa-offline';
  import { m } from '$lib/paraglide/messages.js';
  import {
    Button,
    ComposedModal,
    InlineNotification,
    ModalBody,
    ModalHeader,
    ProgressBar,
    Tag
  } from 'carbon-components-svelte';
  import { CloudDownload } from 'carbon-icons-svelte';
  import { onMount } from 'svelte';
  import OfflineBasemapRow from './offline-basemap-row.svelte';

  const BYTES_PER_MIB = 1024 * 1024;
  const DOWNLOAD_ALL_CONCURRENCY = 2;

  let essentials = $state<BasemapDownloadEntry[]>([]);
  let extended = $state<BasemapDownloadEntry[]>([]);
  let isDownloadAllRunning = $state(false);
  let downloadAllAbortController: AbortController | null = null;

  onMount(() => {
    void loadEntries();
    void connectivityStore.refreshStorageEstimate();
    void connectivityStore.refreshCachedBasemaps();

    return () => {
      downloadAllAbortController?.abort();
    };
  });

  async function loadEntries() {
    try {
      essentials = await buildEssentialDownloadEntries();
      extended = await buildExtendedDownloadEntries();
    } catch {
      // Offline catalog failures leave the panel empty; user actions stay disabled.
    }
  }

  function close() {
    globalState.isOfflinePanelOpen = false;
  }

  function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    return `${(bytes / BYTES_PER_MIB).toFixed(1)} MB`;
  }

  const storageRatio = $derived(connectivityStore.storage?.ratio ?? 0);

  const allDownloadable = $derived.by(() => {
    const seen: Record<string, true> = {};
    const result: BasemapDownloadEntry[] = [];
    for (const entry of [...essentials, ...extended]) {
      if (seen[entry.basemapId]) continue;
      seen[entry.basemapId] = true;
      result.push(entry);
    }
    return result;
  });

  const downloadedCount = $derived(
    allDownloadable.filter(
      (e) => connectivityStore.basemaps.get(e.basemapId)?.status === 'cached'
    ).length
  );

  const allCached = $derived(
    allDownloadable.length > 0 && downloadedCount === allDownloadable.length
  );

  function getEntry(basemapId: string): OfflineBasemapEntry | undefined {
    return connectivityStore.basemaps.get(basemapId);
  }

  const activeDownloadCount = $derived(
    allDownloadable.filter(
      (e) =>
        connectivityStore.basemaps.get(e.basemapId)?.status === 'downloading'
    ).length
  );

  const pendingDownloadCount = $derived(
    allDownloadable.filter((e) => {
      const status = connectivityStore.basemaps.get(e.basemapId)?.status;
      return status !== 'cached' && status !== 'downloading';
    }).length
  );

  function statusType(): 'blue' | 'green' | 'red' | 'purple' | 'gray' {
    if (!connectivityStore.isOnline) return 'red';
    if (allCached) return 'green';
    if (isDownloadAllRunning || activeDownloadCount > 0) return 'purple';
    if (downloadedCount > 0) return 'blue';
    return 'blue';
  }

  function statusTitle(): string {
    if (!connectivityStore.isOnline)
      return m.offline_panel_status_offline_title();
    if (allCached) return m.offline_panel_status_ready_title();
    if (isDownloadAllRunning || activeDownloadCount > 0)
      return m.offline_panel_status_downloading_title();
    if (downloadedCount > 0) return m.offline_panel_status_partial_title();
    return m.offline_panel_status_online_title();
  }

  function statusBody(): string {
    if (!connectivityStore.isOnline)
      return m.offline_panel_status_offline_body();
    if (allCached) return m.offline_panel_status_ready_body();
    if (isDownloadAllRunning || activeDownloadCount > 0)
      return m.offline_panel_status_downloading_body();
    if (downloadedCount > 0) return m.offline_panel_status_partial_body();
    if (connectivityStore.isSlowConnection) {
      return m.offline_panel_status_slow_body();
    }
    return m.offline_panel_status_online_body();
  }

  async function downloadEntry(
    entry: BasemapDownloadEntry,
    signal: AbortSignal
  ) {
    if (signal.aborted) return;
    connectivityStore.setBasemapStatus(entry.basemapId, 'downloading', 0);
    const result = await prepareBasemapForOffline({
      basemapId: entry.basemapId,
      urls: entry.urls,
      title: entry.title
    });
    if (result.status === 'started' || result.status === 'already-running') {
      return;
    }

    const fallback = await cacheUrlsForOffline(
      'basemaps-data',
      entry.urls,
      signal
    );
    if (fallback.status === 'cached') {
      connectivityStore.setBasemapStatus(
        entry.basemapId,
        'cached',
        1,
        fallback.bytes
      );
      void connectivityStore.refreshStorageEstimate();
      return;
    }

    if (result.status === 'unsupported' || result.status === 'failed') {
      connectivityStore.setBasemapStatus(entry.basemapId, 'failed', 0);
    }
  }

  async function runDownloadQueue(
    entries: BasemapDownloadEntry[],
    signal: AbortSignal
  ) {
    let index = 0;

    async function worker() {
      while (index < entries.length) {
        if (signal.aborted) return;
        const entry = entries[index++];
        await downloadEntry(entry, signal);
      }
    }

    const workers = Array.from(
      {
        length: Math.min(DOWNLOAD_ALL_CONCURRENCY, Math.max(1, entries.length))
      },
      () => worker()
    );
    await Promise.all(workers);
  }

  async function handleDownloadAll() {
    if (
      isDownloadAllRunning ||
      !connectivityStore.isOnline ||
      allCached ||
      activeDownloadCount > 0 ||
      pendingDownloadCount === 0
    ) {
      return;
    }

    const entriesToDownload = allDownloadable.filter((entry) => {
      const status = connectivityStore.basemaps.get(entry.basemapId)?.status;
      return status !== 'cached' && status !== 'downloading';
    });
    if (entriesToDownload.length === 0) return;

    isDownloadAllRunning = true;
    downloadAllAbortController = new AbortController();
    try {
      await runDownloadQueue(
        entriesToDownload,
        downloadAllAbortController.signal
      );
      await Promise.allSettled([
        connectivityStore.refreshCachedBasemaps(),
        connectivityStore.refreshStorageEstimate()
      ]);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        logger.error(
          'Failed to download offline basemaps',
          LogCategory.SYSTEM,
          error
        );
      }
    } finally {
      isDownloadAllRunning = false;
      downloadAllAbortController = null;
    }
  }
</script>

<ComposedModal
  open={globalState.isOfflinePanelOpen}
  size="sm"
  containerClass="offline-panel-modal"
  on:close={close}
>
  <ModalHeader title={m.offline_panel_title()} />

  <ModalBody class="offline-panel-body" hasForm>
    <div class="offline-summary">
      <div class="status-row">
        <Tag type={statusType()} size="sm">
          {statusTitle()}
        </Tag>
        <span class="status-counter">
          {m.offline_panel_essentials_progress({
            ready: downloadedCount,
            total: allDownloadable.length
          })}
        </span>
      </div>
      <p>{statusBody()}</p>
    </div>

    {#if connectivityStore.storage}
      <ProgressBar
        value={Math.round(storageRatio * 100)}
        max={100}
        size="sm"
        labelText={m.offline_panel_storage_used({
          usage: formatBytes(connectivityStore.storage.usage),
          quota: formatBytes(connectivityStore.storage.quota)
        })}
      />
    {/if}

    {#if connectivityStore.quotaExceeded}
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title={m.offline_panel_quota_exceeded()}
      />
    {/if}

    <div class="primary-action">
      <Button
        size="small"
        kind="primary"
        icon={CloudDownload}
        disabled={isDownloadAllRunning ||
          !connectivityStore.isOnline ||
          allCached ||
          activeDownloadCount > 0 ||
          pendingDownloadCount === 0}
        on:click={handleDownloadAll}
        data-testid="offline-download-all"
      >
        {!connectivityStore.isOnline
          ? m.offline_panel_download_offline()
          : allCached
            ? m.offline_panel_all_cached()
            : isDownloadAllRunning || activeDownloadCount > 0
              ? m.offline_panel_downloading_all()
              : m.offline_panel_download_all()}
      </Button>
      <p class="primary-helper">
        {m.offline_panel_download_all_helper()}
      </p>
    </div>

    <section
      class="download-list-section"
      aria-label={m.offline_panel_list_title()}
    >
      <div class="download-list-header">
        <h3>{m.offline_panel_list_title()}</h3>
        <span>{m.offline_panel_list_helper()}</span>
      </div>

      {#if allDownloadable.length > 0}
        <ul class="basemap-list">
          {#each allDownloadable as item (item.basemapId)}
            <li>
              <OfflineBasemapRow
                basemapId={item.basemapId}
                title={item.title}
                entry={getEntry(item.basemapId)}
              />
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty-list">{m.offline_panel_catalog_empty()}</p>
      {/if}
    </section>
  </ModalBody>
</ComposedModal>

<style>
  :global(.offline-panel-modal) {
    width: min(92vw, 28rem);
  }

  :global(.offline-panel-body) {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    max-height: 70vh;
    overflow-y: auto;
  }

  .offline-summary {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-04);
    background: var(--cds-layer);
    border: 1px solid var(--cds-border-subtle);
  }

  .offline-summary p {
    margin: 0;
    color: var(--cds-text-02);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-03);
  }

  .status-counter {
    font-size: 0.8125rem;
    color: var(--cds-text-02);
    font-variant-numeric: tabular-nums;
  }

  .primary-action {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .primary-helper {
    margin: 0;
    font-size: 0.75rem;
    color: var(--cds-text-03);
    line-height: 1.3;
  }

  .download-list-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    min-width: 0;
  }

  .download-list-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--cds-spacing-03);
  }

  .download-list-header h3 {
    margin: 0;
    color: var(--cds-text-01);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .download-list-header span {
    color: var(--cds-text-03);
    font-size: 0.75rem;
    text-align: right;
  }

  .basemap-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 18rem;
    overflow-y: auto;
    border-top: 1px solid var(--cds-border-subtle);
  }

  .empty-list {
    margin: 0;
    font-size: 0.875rem;
    color: var(--cds-text-02);
  }
</style>
