<script lang="ts">
  import AdvancedDataTable from '$lib/features/commons/components/advanced-data-table/advanced-data-table.svelte';
  import { GeoreferenceType } from '$lib/features/commons/constants/ui.constants';
  import { dataTabActions } from '$lib/features/commons/store/data-tab.store.svelte';
  import type { DatasetResult } from '$lib/features/data-pipeline';
  import * as m from '$lib/paraglide/messages';
  import { Button, InlineNotification } from 'carbon-components-svelte';
  import { Close, MagicWand } from 'carbon-icons-svelte';
  import {
    GeocodeSettings,
    JoinAccordion,
    SectionHeaderWithIcon,
    type JoinStats
  } from '../../components';
  import type {
    EnrichDataFieldItem,
    GeoFileColumnItem
  } from '../utils/enrichment.utils';

  interface Props {
    enrichmentDataset: DatasetResult;
    enrichmentFile: File | null;
    geoFileColumns: GeoFileColumnItem[];
    enrichDataFieldItems: EnrichDataFieldItem[];
    enrichLinkedVariableId: number | undefined;
    geoFileColumnId: number | undefined;
    enrichSuggestedColumn: EnrichDataFieldItem | undefined;
    hasOnlyCoordinates: boolean;
    joinStats: JoinStats | null;
    isComputingJoin: boolean;
    isFinalizingJoin: boolean;
    onRemoveFile: () => void;
    onEnrichLinkedVariableChange: (
      id: number | undefined,
      columnName?: string
    ) => void;
    onGeoFileColumnChange: (
      id: number | undefined,
      columnName?: string
    ) => void;
    onMappingChange: (index: number, value: string) => void;
    onFinalizeJoin: () => void;
  }

  let {
    enrichmentDataset,
    enrichmentFile,
    geoFileColumns,
    enrichDataFieldItems,
    enrichLinkedVariableId,
    geoFileColumnId,
    enrichSuggestedColumn,
    hasOnlyCoordinates,
    joinStats,
    isComputingJoin,
    isFinalizingJoin,
    onRemoveFile,
    onEnrichLinkedVariableChange,
    onGeoFileColumnChange,
    onMappingChange,
    onFinalizeJoin
  }: Props = $props();

  function handleEnrichColumnSelect(id: number, columnName: string): void {
    onEnrichLinkedVariableChange(id, columnName);
    if (columnName) {
      dataTabActions.setEnrichDataState({ enrichmentColumn: columnName });
    }
  }

  function handleGeoColumnSelect(id: number, columnName: string): void {
    onGeoFileColumnChange(id, columnName);
    if (columnName) {
      dataTabActions.setEnrichDataState({ targetColumn: columnName });
    }
  }

  const enrichmentSelectedColumnName = $derived(
    enrichDataFieldItems.find((c) => c.id === enrichLinkedVariableId)
      ?.columnName
  );

  const geoFileSelectedColumnName = $derived(
    geoFileColumns.find((c) => c.id === geoFileColumnId)?.columnName
  );
</script>

<div class="join-config">
  <div class="file-imported">
    <span class="file-label">{m.enrich_file_imported()}</span>
    <div class="file-row">
      <span class="file-name"
        >{enrichmentFile?.name || m.dataset_pasted_name()}</span
      >
      <Button
        class="file-remove"
        kind="ghost"
        size="small"
        iconDescription={m.remove_file_action()}
        icon={Close}
        tooltipPosition="left"
        on:click={onRemoveFile}
      />
    </div>
  </div>

  <div class="table-preview">
    <span class="preview-label">{m.enrich_table_preview()}</span>
    <div class="preview-container">
      <AdvancedDataTable
        tableName={enrichmentDataset.tableName}
        showSummaryPlots={false}
        isReadOnly={true}
      />
    </div>
  </div>

  {#if hasOnlyCoordinates}
    <InlineNotification
      title={m.enrich_coordinates_only_title()}
      subtitle={m.enrich_coordinates_only_subtitle()}
      kind="error"
      lowContrast
      hideCloseButton={false}
    />
  {:else}
    <h4 class="section-title">{m.enrich_geolocate_section_title()}</h4>

    <p class="section-description">
      {m.enrich_geolocate_description()}
    </p>

    {#if enrichSuggestedColumn}
      <InlineNotification
        title={m.geo_column_detected_title()}
        subtitle={m.geo_column_detected_subtitle({
          column: enrichSuggestedColumn.columnName,
          confidence: Math.round(
            enrichSuggestedColumn.confidence * 100
          ).toString()
        })}
        kind="success"
        lowContrast
        hideCloseButton={false}
      />
    {/if}

    <div class="join-columns-section">
      <h4 class="subsection-title">{m.enrich_geo_reference()}</h4>
      <p class="section-description">{m.enrich_choose_multiple()}</p>

      <GeocodeSettings
        referenceMode={GeoreferenceType.ENTITIES}
        onReferenceModeChange={() => {}}
        layout="paired"
        showCoordinatesTab={false}
        primary={{
          label: m.enrich_geo_file_label(),
          items: geoFileColumns,
          selectedId: geoFileColumnId,
          selectedColumnName: geoFileSelectedColumnName,
          badgeType: 'geo-ref',
          placeholder: m.enrich_select_column(),
          onSelect: handleGeoColumnSelect
        }}
        paired={{
          label: m.enrich_tabular_data_label(),
          items: enrichDataFieldItems,
          selectedId: enrichLinkedVariableId,
          selectedColumnName: enrichmentSelectedColumnName,
          badgeType: 'geo-ref',
          placeholder: m.enrich_select_column(),
          onSelect: handleEnrichColumnSelect
        }}
      />
    </div>

    <div class="join-assisted-section">
      <h4 class="section-title">{m.enrich_verify_section_title()}</h4>

      {#if joinStats || isComputingJoin}
        <SectionHeaderWithIcon
          title={m.section_join_assisted()}
          icon={MagicWand}
        />

        {#if isComputingJoin}
          <div class="computing-join">
            <span>{m.enrich_computing_join()}</span>
          </div>
        {:else if joinStats}
          <JoinAccordion
            stats={joinStats}
            showCorrectionTable={true}
            linkedVariableName={enrichDataFieldItems.find(
              (i) => i.id === enrichLinkedVariableId
            )?.columnName}
            onMappingChange={onMappingChange}
            onFinalizeJoin={onFinalizeJoin}
          />

          {#if isFinalizingJoin}
            <div class="finalizing-join">
              <span>{m.enrich_finalizing_join()}</span>
            </div>
          {/if}
        {/if}
      {:else}
        <p class="placeholder-text">
          {m.enrich_select_columns_to_join()}
        </p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .join-config {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
    margin-top: var(--cds-spacing-03);
  }

  .section-description {
    font-size: 0.8125rem;
    color: var(--cds-text-02);
    line-height: 1.4;
  }

  .file-imported {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .file-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .file-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--cds-spacing-03);
    background-color: var(--cds-layer-02);
    border: 1px solid var(--cds-border-subtle);
  }

  .file-name {
    font-size: 0.875rem;
    color: var(--cds-text-01);
  }

  .table-preview {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .preview-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .preview-container {
    border: 1px solid var(--cds-border-subtle);
    overflow: hidden;
  }

  .preview-container :global(.advanced-data-table) {
    padding: 0;
  }

  .join-columns-section {
    margin-top: var(--cds-spacing-04);
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .subsection-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--cds-text-01);
    margin-bottom: var(--cds-spacing-02);
  }

  .join-assisted-section {
    margin-top: var(--cds-spacing-06);
    padding-top: var(--cds-spacing-06);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .computing-join {
    padding: var(--cds-spacing-05);
    text-align: center;
    color: var(--cds-text-02);
    font-style: italic;
  }

  .finalizing-join {
    padding: var(--cds-spacing-05);
    text-align: center;
    color: var(--cds-support-success);
    font-weight: 500;
    background-color: var(--cds-layer-01);
    margin-top: var(--cds-spacing-04);
  }

  .placeholder-text {
    font-size: 0.8125rem;
    color: var(--cds-text-02);
    padding: var(--cds-spacing-04);
    background-color: var(--cds-layer-02);
    text-align: center;
  }
</style>
