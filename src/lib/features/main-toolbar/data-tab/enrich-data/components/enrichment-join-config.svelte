<script lang="ts">
  import AdvancedDataTable from '$lib/features/commons/components/advanced-data-table/advanced-data-table.svelte';
  import { dataTabActions } from '$lib/features/commons/store/data-tab.store.svelte';
  import type { DatasetResult } from '$lib/features/data-pipeline';
  import * as m from '$lib/paraglide/messages';
  import { ComboBox, InlineNotification } from 'carbon-components-svelte';
  import { Close, MagicWand } from 'carbon-icons-svelte';
  import { JoinAccordion, type JoinStats } from '../../components';
  import SectionHeaderWithIcon from '../../components/section-header-with-icon.svelte';
  import type { GeoComboBoxItem } from '../../data-tab.shared.types';
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
    onApplyCorrections: () => void;
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
    onApplyCorrections,
    onFinalizeJoin
  }: Props = $props();

  function handleEnrichColumnSelect(
    e: CustomEvent<{ selectedId: number; selectedItem: unknown }>
  ) {
    const item = e.detail.selectedItem as GeoComboBoxItem | null;
    onEnrichLinkedVariableChange(e.detail.selectedId, item?.columnName);
    if (item?.columnName) {
      dataTabActions.setEnrichDataState({
        enrichmentColumn: item.columnName
      });
    }
  }

  function handleGeoColumnSelect(
    e: CustomEvent<{ selectedId: number; selectedItem: unknown }>
  ) {
    const item = e.detail.selectedItem as { columnName: string } | null;
    onGeoFileColumnChange(e.detail.selectedId, item?.columnName);
    if (item?.columnName) {
      dataTabActions.setEnrichDataState({
        targetColumn: item.columnName
      });
    }
  }
</script>

<div class="join-config">
  <div class="file-imported">
    <span class="file-label">{m.enrich_file_imported()}</span>
    <div class="file-row">
      <span class="file-name"
        >{enrichmentFile?.name || m.dataset_pasted_name()}</span
      >
      <button class="file-remove" onclick={onRemoveFile}>
        <Close size={16} />
      </button>
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
      kind="warning"
      lowContrast
      hideCloseButton={false}
    />
  {/if}

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

    <div class="geo-columns-row">
      <div class="geo-column-select">
        <ComboBox
          items={geoFileColumns}
          selectedId={geoFileColumnId}
          on:select={handleGeoColumnSelect}
          placeholder={m.enrich_select_column()}
          size="sm"
        />
        <span class="column-label">{m.enrich_geo_file_label()}</span>
      </div>

      <span class="column-separator">⇄</span>

      <div class="geo-column-select">
        <ComboBox
          items={enrichDataFieldItems}
          selectedId={enrichLinkedVariableId}
          on:select={handleEnrichColumnSelect}
          placeholder={m.enrich_select_column()}
          size="sm"
        />
        <span class="column-label">{m.enrich_tabular_data_label()}</span>
      </div>
    </div>
  </div>

  {#if joinStats || isComputingJoin}
    <div class="join-assisted-section">
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
          onApplyCorrections={onApplyCorrections}
          onFinalizeJoin={onFinalizeJoin}
        />

        {#if isFinalizingJoin}
          <div class="finalizing-join">
            <span>{m.enrich_finalizing_join()}</span>
          </div>
        {/if}
      {/if}
    </div>
  {:else}
    <h4 class="section-title">{m.enrich_verify_section_title()}</h4>
    <p class="placeholder-text">
      {m.enrich_select_columns_to_join()}
    </p>
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

  .file-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--cds-icon-01);
    padding: var(--cds-spacing-01);
  }

  .file-remove:hover {
    color: var(--cds-support-error);
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

  .geo-columns-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .geo-column-select {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .column-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .column-separator {
    font-size: 1.25rem;
    color: var(--cds-text-02);
    margin-top: -1rem;
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
