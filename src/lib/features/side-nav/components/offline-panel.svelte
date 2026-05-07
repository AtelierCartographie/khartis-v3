<script lang="ts">
  import {
    connectivityStore,
    type OfflineBasemapEntry
  } from '$lib/features/commons/stores/connectivity.store.svelte';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import {
    buildEssentialDownloadEntries,
    buildExtendedDownloadEntries,
    classifyBasemapRegion,
    type BasemapDownloadEntry,
    type BasemapRegion
  } from '$lib/features/commons/utils/offline-basemap-sets';
  import {
    cancelOfflineBasemap,
    factoryResetPwa,
    prepareBasemapForOffline
  } from '$lib/features/commons/utils/pwa-offline';
  import {
    areOfflineDownloadsDisabled,
    setOfflineDownloadsDisabled,
    startExtendedWarmup
  } from '$lib/features/commons/utils/offline-warmup-scheduler';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { m } from '$lib/paraglide/messages.js';
  import {
    Accordion,
    AccordionItem,
    Button,
    ComposedModal,
    InlineNotification,
    ModalBody,
    ModalHeader,
    ProgressBar,
    Tag
  } from 'carbon-components-svelte';
  import { CloudDownload, Restart } from 'carbon-icons-svelte';
  import { onMount } from 'svelte';
  import OfflineBasemapRow from './offline-basemap-row.svelte';

  const BYTES_PER_MIB = 1024 * 1024;

  let essentials = $state<BasemapDownloadEntry[]>([]);
  let extended = $state<BasemapDownloadEntry[]>([]);
  let isFactoryResetConfirmOpen = $state(false);
  let isFactoryResetRunning = $state(false);
  let isExtendedWarmupRunning = $state(false);
  let downloadsDisabled = $state(false);
  let extendedAbortController: AbortController | null = null;

  onMount(() => {
    void loadEntries();
    downloadsDisabled = areOfflineDownloadsDisabled();
    void connectivityStore.refreshStorageEstimate();
    void connectivityStore.refreshCachedBasemaps();

    return () => {
      extendedAbortController?.abort();
    };
  });

  async function loadEntries() {
    try {
      essentials = await buildEssentialDownloadEntries();
      extended = await buildExtendedDownloadEntries();
    } catch (error) {
      logger.warn('Failed to load offline entries', LogCategory.SYSTEM, error);
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

  const groupedByRegion = $derived(() => {
    const groups: Record<BasemapRegion, BasemapDownloadEntry[]> = {
      france: [],
      europe: [],
      monde: [],
      autre: []
    };
    for (const entry of allDownloadable) {
      groups[classifyBasemapRegion(entry.basemapId)].push(entry);
    }
    return groups;
  });

  function getEntry(basemapId: string): OfflineBasemapEntry | undefined {
    return connectivityStore.basemaps.get(basemapId);
  }

  function regionLabel(region: BasemapRegion): string {
    switch (region) {
      case 'france':
        return m.offline_panel_catalog_france();
      case 'europe':
        return m.offline_panel_catalog_europe();
      case 'monde':
        return m.offline_panel_catalog_world();
      default:
        return m.offline_panel_catalog_other();
    }
  }

  async function handleDownload(basemapId: string) {
    const entry = allDownloadable.find((e) => e.basemapId === basemapId);
    if (!entry) return;
    connectivityStore.setBasemapStatus(basemapId, 'downloading', 0);
    const result = await prepareBasemapForOffline({
      basemapId,
      urls: entry.urls,
      title: entry.title
    });
    if (result.status === 'unsupported' || result.status === 'failed') {
      connectivityStore.setBasemapStatus(basemapId, 'failed', 0);
    }
  }

  async function handleCancel(basemapId: string) {
    await cancelOfflineBasemap(basemapId);
    connectivityStore.setBasemapStatus(basemapId, 'unknown', 0);
  }

  async function handleDelete(basemapId: string) {
    if (typeof caches === 'undefined') return;
    try {
      const cache = await caches.open('basemaps-data');
      const requests = await cache.keys();
      const targets = requests.filter((req) =>
        req.url.includes(`/${basemapId}.parquet`)
      );
      await Promise.all(targets.map((req) => cache.delete(req)));
      connectivityStore.setBasemapStatus(basemapId, 'evicted', 0);
      void connectivityStore.refreshStorageEstimate();
    } catch (error) {
      logger.warn('Failed to delete basemap cache', LogCategory.SYSTEM, error);
    }
  }

  async function handleDownloadAll() {
    if (isExtendedWarmupRunning || !connectivityStore.isOnline) return;
    isExtendedWarmupRunning = true;
    extendedAbortController = new AbortController();
    try {
      await startExtendedWarmup({
        store: connectivityStore,
        signal: extendedAbortController.signal
      });
    } finally {
      isExtendedWarmupRunning = false;
    }
  }

  async function confirmFactoryReset() {
    isFactoryResetRunning = true;
    try {
      await factoryResetPwa({ reload: true });
    } finally {
      isFactoryResetRunning = false;
      isFactoryResetConfirmOpen = false;
    }
  }

  function toggleDownloadsDisabled() {
    downloadsDisabled = !downloadsDisabled;
    setOfflineDownloadsDisabled(downloadsDisabled);
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
    <div class="status-row">
      <Tag type={connectivityStore.isOnline ? 'blue' : 'red'} size="sm">
        {connectivityStore.isOnline
          ? m.sidenav_offline_status_online()
          : m.sidenav_offline_status_offline()}
      </Tag>
      <span class="status-counter">
        {m.offline_panel_essentials_progress({
          ready: downloadedCount,
          total: allDownloadable.length
        })}
      </span>
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
        disabled={isExtendedWarmupRunning ||
          !connectivityStore.isOnline ||
          allCached}
        on:click={handleDownloadAll}
        data-testid="offline-download-all"
      >
        {allCached
          ? m.offline_panel_all_cached()
          : isExtendedWarmupRunning
            ? m.offline_panel_downloading_all()
            : m.offline_panel_download_all()}
      </Button>
      <p class="primary-helper">
        {m.offline_panel_download_all_helper()}
      </p>
    </div>

    <Accordion size="sm" align="start" class="catalog-accordion">
      {#each ['monde', 'europe', 'france', 'autre'] as const as region (region)}
        {@const items = groupedByRegion()[region]}
        {#if items.length > 0}
          {@const cachedHere = items.filter(
            (e) =>
              connectivityStore.basemaps.get(e.basemapId)?.status === 'cached'
          ).length}
          <AccordionItem
            title={`${regionLabel(region)} · ${cachedHere}/${items.length}`}
          >
            <ul class="basemap-list">
              {#each items as item (item.basemapId)}
                <li>
                  <OfflineBasemapRow
                    basemapId={item.basemapId}
                    title={item.title}
                    entry={getEntry(item.basemapId)}
                    onDownload={handleDownload}
                    onCancel={handleCancel}
                    onDelete={handleDelete}
                  />
                </li>
              {/each}
            </ul>
          </AccordionItem>
        {/if}
      {/each}
    </Accordion>

    <div class="maintenance-section">
      <div class="maintenance-row">
        <div class="maintenance-copy">
          <p class="maintenance-label">
            {downloadsDisabled
              ? m.offline_panel_enable_downloads()
              : m.offline_panel_disable_downloads()}
          </p>
        </div>
        <Button size="small" kind="ghost" on:click={toggleDownloadsDisabled}>
          {downloadsDisabled
            ? m.offline_panel_action_enable()
            : m.offline_panel_action_disable()}
        </Button>
      </div>

      <div class="maintenance-row">
        <div class="maintenance-copy">
          <p class="maintenance-label">
            {m.offline_panel_reset_all()}
          </p>
          <p class="maintenance-helper">
            {m.offline_panel_reset_all_helper()}
          </p>
        </div>
        <Button
          size="small"
          kind="danger-tertiary"
          icon={Restart}
          on:click={() => (isFactoryResetConfirmOpen = true)}
          data-testid="offline-factory-reset-btn"
        >
          {m.offline_panel_reset_all_action()}
        </Button>
      </div>
    </div>
  </ModalBody>
</ComposedModal>

<ComposedModal
  open={isFactoryResetConfirmOpen}
  size="xs"
  on:close={() => (isFactoryResetConfirmOpen = false)}
>
  <ModalHeader title={m.offline_panel_reset_all_confirm_title()} />
  <ModalBody>
    <InlineNotification
      kind="warning"
      lowContrast
      hideCloseButton
      title={m.offline_panel_reset_all_warning_title()}
      subtitle={m.offline_panel_reset_all_warning_subtitle()}
    />
    <p class="reset-body-paragraph">
      {m.offline_panel_reset_all_confirm_body()}
    </p>
  </ModalBody>
  <div class="confirm-modal-footer">
    <Button
      kind="secondary"
      disabled={isFactoryResetRunning}
      on:click={() => (isFactoryResetConfirmOpen = false)}
    >
      {m.offline_panel_clear_confirm_cancel()}
    </Button>
    <Button
      kind="danger"
      disabled={isFactoryResetRunning}
      on:click={confirmFactoryReset}
    >
      {isFactoryResetRunning
        ? m.offline_panel_reset_all_in_progress()
        : m.offline_panel_reset_all_action()}
    </Button>
  </div>
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

  :global(.catalog-accordion .bx--accordion__item) {
    border-color: var(--cds-border-subtle);
  }

  .basemap-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .maintenance-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
    padding-top: var(--cds-spacing-04);
  }

  .maintenance-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--cds-spacing-04);
  }

  .maintenance-copy {
    flex: 1;
    min-width: 0;
  }

  .maintenance-label {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--cds-text-01);
    font-weight: 500;
  }

  .maintenance-helper {
    margin: var(--cds-spacing-01) 0 0;
    font-size: 0.75rem;
    color: var(--cds-text-03);
    line-height: 1.4;
  }

  .confirm-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-04) var(--cds-spacing-05);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .reset-body-paragraph {
    margin: var(--cds-spacing-04) 0 0;
    font-size: 0.875rem;
    color: var(--cds-text-02);
  }
</style>
