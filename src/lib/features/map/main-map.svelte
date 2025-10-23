<script lang="ts">
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import { onMount } from 'svelte';
  import { datasetsStore } from '../commons/store/datasets.store.svelte';
  import { LogCategory, logger } from '../commons/utils/logger';
  import DeckMap from './components/deck-map.svelte';
  import { basemapService } from './services/basemap.service.svelte';

  let isInitializing = $state(true);
  let displayTable = $state<ArrowTable | null>(null);
  let displayGeoJSON = $state<any | null>(null);

  const selectedDataset = $derived(datasetsStore.selectedDataset);

  async function convertDatasetToGeoJSON(dataset: any): Promise<any | null> {
    try {
      logger.info('Processing dataset for geometry', LogCategory.MAP, {
        name: dataset.name,
        hasGeometry: !!dataset.geometry,
        dataLength: dataset.data?.length
      });

      if (dataset.geometry && dataset.data && dataset.data.length > 0) {
        logger.info('Converting dataset to GeoJSON', LogCategory.MAP, {
          name: dataset.name,
          featureCount: dataset.data.length
        });

        const features = dataset.data.map((row: any, index: number) => ({
          type: 'Feature',
          id: index,
          properties: { ...row },
          geometry: row.geometry || null
        }));

        const geojson = {
          type: 'FeatureCollection',
          features
        };

        logger.success('GeoJSON created for display', LogCategory.MAP, {
          featureCount: features.length,
          sampleGeometry: features[0]?.geometry?.type
        });

        return geojson;
      }

      logger.info('Dataset has no geometry', LogCategory.MAP, {
        name: dataset.name
      });
      return null;
    } catch (error) {
      logger.error(
        'Failed to convert dataset to GeoJSON',
        LogCategory.MAP,
        error
      );
      return null;
    }
  }

  async function loadFallbackBasemap(): Promise<void> {
    logger.info('Loading fallback basemap', LogCategory.MAP);

    const basemap = await basemapService.loadDefaultBasemap();

    if (basemap?.geometryTable) {
      displayTable = basemap.geometryTable;
      logger.success('Fallback basemap loaded', LogCategory.MAP);
    } else {
      logger.error('Failed to load fallback basemap', LogCategory.MAP);
    }
  }

  $effect(() => {
    if (isInitializing) {
      logger.info('Skipping effect during initialization', LogCategory.MAP);
      return;
    }

    if (selectedDataset) {
      logger.info('Dataset selected, processing...', LogCategory.MAP, {
        name: selectedDataset.name,
        hasGeometry: !!selectedDataset.geometry
      });

      if (selectedDataset.geometry) {
        convertDatasetToGeoJSON(selectedDataset).then((geojson) => {
          if (geojson) {
            displayTable = null;
            displayGeoJSON = geojson;
            logger.success(
              'Dataset GeoJSON ready for display',
              LogCategory.MAP,
              {
                featureCount: geojson.features.length
              }
            );
          } else {
            logger.warn(
              'Dataset conversion failed, loading basemap',
              LogCategory.MAP
            );
            loadFallbackBasemap();
          }
        });
      } else {
        logger.info(
          'Dataset has no geometry, loading basemap',
          LogCategory.MAP
        );
        loadFallbackBasemap();
      }
    } else {
      logger.info('No dataset selected, loading basemap', LogCategory.MAP);
      loadFallbackBasemap();
    }
  });

  onMount(async () => {
    logger.info('Initializing map component', LogCategory.MAP);

    await basemapService.initialize();

    if (selectedDataset?.geometry) {
      logger.info(
        'Initial dataset has geometry, converting...',
        LogCategory.MAP
      );
      const geojson = await convertDatasetToGeoJSON(selectedDataset);
      if (geojson) {
        displayGeoJSON = geojson;
        logger.success('Initial dataset GeoJSON loaded', LogCategory.MAP);
      } else {
        await loadFallbackBasemap();
      }
    } else {
      logger.info(
        'No initial dataset geometry, loading basemap',
        LogCategory.MAP
      );
      await loadFallbackBasemap();
    }

    isInitializing = false;
    logger.success('Map component initialized', LogCategory.MAP);
  });
</script>

<div class="map-container">
  {#if isInitializing}
    <div class="loading-state">Initializing map...</div>
  {:else if displayTable}
    <DeckMap jsTable={displayTable} userGeoJSON={null} />
  {:else if displayGeoJSON}
    <DeckMap jsTable={null} userGeoJSON={displayGeoJSON} />
  {:else}
    <div class="empty-state">No data loaded</div>
  {/if}
</div>

<style>
  .map-container {
    width: 100%;
    height: 700px;
    background-color: white;
    position: relative;
  }

  .loading-state,
  .empty-state {
    width: 100%;
    height: 700px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cds-text-secondary);
    background-color: white;
  }
</style>
