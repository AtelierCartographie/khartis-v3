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
  async function handleImport() {
    if (files.length === 0) {
      error = m.basemap_import_modal_error_select_file();
      return;
    }

    const duck = Duck;
    if (!duck) {
      error = m.basemap_custom_error();
      logger.error(
        'DuckDB not initialized for custom basemap import',
        LogCategory.MAP
      );
      return;
    }

    uploading = true;
    error = null;

    try {
      const file = files[0];

      await duck.register_files([file]);

      const tableNameResult = await duck.read_geofile(file, {
        tablename: `custom_basemap_${Date.now()}`
      });
      const tableName =
        typeof tableNameResult === 'string'
          ? tableNameResult
          : (tableNameResult?.name ??
            `custom_basemap_${Date.now().toString(36)}`);

      const analysis = await duck.analyse(tableName);

      const bboxQuery = (await duck.query(
        `
        SELECT
          ST_XMin(ST_Extent(geom)) as minX,
          ST_YMin(ST_Extent(geom)) as minY,
          ST_XMax(ST_Extent(geom)) as maxX,
          ST_YMax(ST_Extent(geom)) as maxY
        FROM "${tableName}"
      `,
        { format: 'array', useProxy: false }
      )) as Array<{
        minX: number | null;
        minY: number | null;
        maxX: number | null;
        maxY: number | null;
      }>;
      const bounds = bboxQuery[0];

      if (
        !bounds ||
        bounds.minX === null ||
        bounds.minY === null ||
        bounds.maxX === null ||
        bounds.maxY === null
      ) {
        throw new Error(m.basemap_import_modal_error_invalid_geometry());
      }

      const geomTypeQuery = (await duck.query(
        `
        SELECT DISTINCT ST_GeometryType(geom) as geom_type
        FROM "${tableName}"
        LIMIT 1
      `,
        { format: 'array', useProxy: false }
      )) as Array<{ geom_type?: string }>;
      const geomType = geomTypeQuery[0]?.geom_type?.toLowerCase() ?? 'polygon';

      const layerType = geomType.includes('point')
        ? 'point'
        : geomType.includes('line')
          ? 'line'
          : 'polygon';

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
            count:
              Number(analysis.find((col) => col.name === 'geom')?.count) || 0
          }
        ],
        isCustom: true
      };

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
