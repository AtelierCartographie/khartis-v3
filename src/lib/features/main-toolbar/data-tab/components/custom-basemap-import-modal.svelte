<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import {
    Modal,
    FileUploader,
    InlineNotification
  } from 'carbon-components-svelte';
  import { Duck } from '$lib/features/duckdb';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import { generateCustomBasemapAttributes } from '$lib/features/map/utils/generate-basemap-attributes';
  import { logger, LogCategory } from '$lib/features/commons/utils/logger';

  interface Props {
    open: boolean;
    onClose: () => void;
    onImport: (basemap: BasemapMetadata) => void;
  }

  let { open = $bindable(), onClose, onImport }: Props = $props();

  let files = $state<File[]>([]);
  let uploading = $state(false);
  let error = $state<string | null>(null);

  const acceptedExtensions = [
    '.geojson',
    '.json',
    '.shp',
    '.gpkg',
    '.kml',
    '.parquet'
  ];
  const acceptedTypes = [
    'application/json',
    'application/geo+json',
    'application/geopackage+sqlite3',
    'application/vnd.google-earth.kml+xml',
    'application/x-parquet'
  ];

  async function handleImport() {
    if (files.length === 0) {
      error = m.basemap_import_modal_error_select_file();
      return;
    }

    uploading = true;
    error = null;

    try {
      const file = files[0];

      // Register file with DuckDB
      await Duck.register_files([file]);

      // Read as geofile to get table name
      const tableName = await Duck.read_geofile(file, {
        tablename: `custom_basemap_${Date.now()}`
      });

      // Analyze the geometry
      const analysis = await Duck.analyse(tableName);

      // Calculate bounding box from geometry
      const bboxQuery = await Duck.query(`
        SELECT
          ST_XMin(ST_Extent(geom)) as minX,
          ST_YMin(ST_Extent(geom)) as minY,
          ST_XMax(ST_Extent(geom)) as maxX,
          ST_YMax(ST_Extent(geom)) as maxY
        FROM ${tableName}
      `);
      const bounds = bboxQuery[0];

      // Detect geometry type
      const geomTypeQuery = await Duck.query(`
        SELECT DISTINCT ST_GeometryType(geom) as geom_type
        FROM ${tableName}
        LIMIT 1
      `);
      const geomType = geomTypeQuery[0]?.geom_type?.toLowerCase() || 'polygon';

      // Map geometry type to layer type
      const layerType = geomType.includes('point')
        ? 'point'
        : geomType.includes('line')
          ? 'line'
          : 'polygon';

      // Create custom basemap metadata
      const customBasemap: BasemapMetadata = {
        file: tableName,
        title: file.name.replace(/\.[^/.]+$/, ''),
        description: m.basemap_custom_description(),
        source: m.basemap_custom_source(),
        date: new Date().getFullYear().toString(),
        bbox: [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY],
        projection: 'EPSG:4326',
        layers: [
          {
            name: 'geom',
            type: layerType,
            count: analysis.find((col) => col.name === 'geom')?.count || 0
          }
        ],
        isCustom: true
      };

      // Generate normalized attributes for fuzzy matching
      await generateCustomBasemapAttributes(tableName, customBasemap.file);

      onImport(customBasemap);
      onClose();
      resetState();
    } catch (err) {
      logger.error('Error importing custom basemap', LogCategory.MAP, err);
      error = err instanceof Error ? err.message : m.basemap_custom_error();
    } finally {
      uploading = false;
    }
  }

  function resetState() {
    files = [];
    error = null;
    uploading = false;
  }

  $effect(() => {
    if (!open) {
      resetState();
    }
  });
</script>

<Modal
  bind:open={open}
  modalHeading={m.basemap_import_modal_title()}
  primaryButtonText={m.basemap_import_modal_button_import()}
  secondaryButtonText={m.basemap_import_modal_button_cancel()}
  primaryButtonDisabled={files.length === 0 || uploading}
  size="sm"
  on:click:button--secondary={onClose}
  on:submit={handleImport}
  on:close={onClose}
>
  <div class="modal-content">
    <p class="description">
      {m.basemap_import_modal_description()}
    </p>

    <FileUploader
      labelTitle={m.basemap_import_modal_file_label()}
      labelDescription={m.basemap_import_modal_file_description({
        formats: acceptedExtensions.join(', ')
      })}
      buttonLabel={m.basemap_import_modal_button_browse()}
      bind:files={files}
      accept={acceptedExtensions}
      status={uploading ? 'uploading' : error ? 'edit' : 'complete'}
    />

    {#if error}
      <InlineNotification
        kind="error"
        title={m.basemap_custom_error()}
        subtitle={error}
        hideCloseButton={false}
        lowContrast
      />
    {/if}
  </div>
</Modal>

<style>
  .modal-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .description {
    margin: 0;
    color: var(--cds-text-02);
    font-size: 0.875rem;
    line-height: 1.5;
  }
</style>
