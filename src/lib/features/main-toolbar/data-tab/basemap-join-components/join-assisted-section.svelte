<script lang="ts">
  import VariableBadge from '$lib/features/commons/components/variable-badge.svelte';
  import { dataTabActions } from '$lib/features/commons/store/data-tab.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    ComboBox,
    InlineNotification,
    NotificationActionButton,
    Select,
    SelectItem
  } from 'carbon-components-svelte';
  import {
    CheckmarkFilled,
    ChevronDown,
    ChevronUp,
    ErrorFilled,
    MagicWand,
    WarningAltFilled,
    WarningFilled
  } from 'carbon-icons-svelte';
  import { InfoPopover } from '../../visualization-tab/components/shared';

  interface JoinRow {
    dataValue: string;
    selectedMapping: string;
    basemapOptions: string[];
  }

  interface ComboBoxItem {
    id: string;
    text: string;
  }

  interface Props {
    joinRows: JoinRow[];
    duplicates: string[];
    unknowns: string[];
    joinedCount: number;
    toVerifyCount: number;
    linkedVariableName: string | undefined;
    basemapValues?: string[];
    loading?: boolean;
    joinFinalized?: boolean;
    onApplyCorrections: () => void;
    onFinalizeJoin: () => void;
    onManualCorrection?: (dataValue: string, basemapValue: string) => void;
  }

  let {
    joinRows,
    duplicates,
    unknowns,
    joinedCount,
    toVerifyCount,
    linkedVariableName,
    basemapValues = [],
    loading = false,
    joinFinalized = false,
    onApplyCorrections,
    onFinalizeJoin,
    onManualCorrection
  }: Props = $props();

  const basemapComboBoxItems = $derived<ComboBoxItem[]>(
    basemapValues.map((value) => ({ id: value, text: value }))
  );

  const duplicateCount = $derived(duplicates.length);
  const unrecognizedCount = $derived(unknowns.length);

  const deduplicatedJoinRows = $derived(
    joinRows.map((row) => ({
      ...row,
      basemapOptions: [...new Set(row.basemapOptions)]
    }))
  );

  let joinedExpanded = $state(false);
  let toVerifyExpanded = $state(false);
  let duplicatesExpanded = $state(false);
  let unrecognizedExpanded = $state(false);

  const hasBlockingErrors = $derived(toVerifyCount > 0);
  const showCorrectionNotification = $derived(
    hasBlockingErrors && toVerifyCount > 0
  );
  const showSuccessNotification = $derived(
    !hasBlockingErrors && joinedCount > 0 && joinFinalized
  );
  const showValidationNotification = $derived(
    !hasBlockingErrors && joinedCount > 0 && !joinFinalized
  );

  interface NotificationSnapshot {
    hasBlockingErrors: boolean;
    showCorrectionNotification: boolean;
    showSuccessNotification: boolean;
    showValidationNotification: boolean;
  }

  const currentNotificationState = $derived<NotificationSnapshot>({
    hasBlockingErrors,
    showCorrectionNotification,
    showSuccessNotification,
    showValidationNotification
  });

  function collapseAllSections(): void {
    joinedExpanded = false;
    toVerifyExpanded = false;
    duplicatesExpanded = false;
    unrecognizedExpanded = false;
  }

  let wasLoading = $state(false);
  let notificationSnapshot = $state<NotificationSnapshot>({
    hasBlockingErrors: false,
    showCorrectionNotification: false,
    showSuccessNotification: false,
    showValidationNotification: false
  });

  const displayedNotificationState = $derived(
    loading ? notificationSnapshot : currentNotificationState
  );

  $effect(() => {
    if (loading && !wasLoading) {
      collapseAllSections();
    }

    wasLoading = loading;
  });

  $effect(() => {
    if (!loading) {
      notificationSnapshot = currentNotificationState;
    }
  });
</script>

<div class="join-assisted-section">
  <div class="section-header">
    <span class="section-title">{m.section_join_assisted()}</span>
    <span class="section-header-icon">
      <MagicWand size={16} />
    </span>
    <InfoPopover text={m.join_assisted_info()} />
  </div>

  <div class="join-assisted-content" class:is-loading={loading}>
    <div class="category-rows">
      <div class="category-row category-row-joined">
        <button
          class="category-row-header"
          onclick={() => (joinedExpanded = !joinedExpanded)}
          aria-expanded={joinedExpanded}
        >
          <span class="category-icon icon-success">
            <CheckmarkFilled size={20} />
          </span>
          <div class="category-count count-success">{joinedCount}</div>
          <span class="category-label label-success"
            >{m.join_entities_joined({ count: joinedCount })}</span
          >
          <span class="category-chevron">
            {#if joinedExpanded}
              <ChevronUp size={20} />
            {:else}
              <ChevronDown size={20} />
            {/if}
          </span>
        </button>
        {#if joinedExpanded}
          <div class="category-body">
            <p class="category-body-text">
              {m.join_entities_joined_desc()}
            </p>
          </div>
        {/if}
      </div>

      <div class="category-row category-row-verify">
        <button
          class="category-row-header"
          onclick={() => (toVerifyExpanded = !toVerifyExpanded)}
          aria-expanded={toVerifyExpanded}
        >
          <span class="category-icon icon-warning">
            <WarningFilled size={20} />
          </span>
          <div class="category-count count-warning">{toVerifyCount}</div>
          <span class="category-label label-warning"
            >{m.join_entities_to_verify({ count: toVerifyCount })}</span
          >
          <span class="category-chevron">
            {#if toVerifyExpanded}
              <ChevronUp size={20} />
            {:else}
              <ChevronDown size={20} />
            {/if}
          </span>
        </button>
        {#if toVerifyExpanded}
          <div class="category-body">
            <div class="join-table">
              <div class="table-header">
                <div class="table-header-left">
                  <span class="table-header-label">{m.join_data_column()}</span>
                  {#if linkedVariableName}
                    <VariableBadge label={linkedVariableName} type="geo-ref" />
                  {/if}
                </div>
                <div class="table-header-right">
                  <span class="table-header-label"
                    >{m.join_basemap_column()}</span
                  >
                </div>
              </div>
              {#each deduplicatedJoinRows as row, i (i)}
                <div class="table-row">
                  <div class="table-cell cell-data">{row.dataValue}</div>
                  <div class="table-cell cell-equals">=</div>
                  <div class="table-cell cell-select">
                    <Select
                      id={`join-${i}`}
                      labelText=""
                      selected={row.selectedMapping}
                      on:change={(e) => {
                        const target = e.target as HTMLSelectElement;
                        const selectedValue =
                          target?.value || row.selectedMapping;
                        dataTabActions.updateJoinMapping(i, selectedValue);
                      }}
                      size="sm"
                    >
                      {#each row.basemapOptions as opt (opt)}
                        <SelectItem value={opt} text={opt} />
                      {/each}
                    </Select>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <div class="category-row category-row-duplicates">
        <button
          class="category-row-header"
          onclick={() => (duplicatesExpanded = !duplicatesExpanded)}
          aria-expanded={duplicatesExpanded}
        >
          <span class="category-icon icon-warning-alt">
            <WarningAltFilled size={20} />
          </span>
          <div class="category-count count-warning-alt">{duplicateCount}</div>
          <span class="category-label label-warning-alt"
            >{m.join_entities_duplicate({ count: duplicateCount })}</span
          >
          <span class="category-chevron">
            {#if duplicatesExpanded}
              <ChevronUp size={20} />
            {:else}
              <ChevronDown size={20} />
            {/if}
          </span>
        </button>
        {#if duplicatesExpanded && duplicateCount > 0}
          <div class="category-body">
            <ul class="entity-list">
              {#each duplicates as entity (entity)}
                <li class="entity-item">{entity}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      <div class="category-row category-row-unrecognized">
        <button
          class="category-row-header"
          onclick={() => (unrecognizedExpanded = !unrecognizedExpanded)}
          aria-expanded={unrecognizedExpanded}
        >
          <span class="category-icon icon-error">
            <ErrorFilled size={20} />
          </span>
          <div class="category-count count-error">{unrecognizedCount}</div>
          <span class="category-label label-error"
            >{m.join_entities_unrecognized({
              count: unrecognizedCount
            })}</span
          >
          <span class="category-chevron">
            {#if unrecognizedExpanded}
              <ChevronUp size={20} />
            {:else}
              <ChevronDown size={20} />
            {/if}
          </span>
        </button>
        {#if unrecognizedExpanded && unrecognizedCount > 0}
          <div class="category-body">
            {#if basemapComboBoxItems.length > 0 && onManualCorrection}
              <div class="unrecognized-correction-table">
                {#each unknowns as entity (entity)}
                  <div class="unrecognized-row">
                    <div class="unrecognized-cell cell-data">{entity}</div>
                    <div class="unrecognized-cell cell-arrow">&rarr;</div>
                    <div class="unrecognized-cell cell-combobox">
                      <ComboBox
                        items={basemapComboBoxItems}
                        placeholder={m.join_unrecognized_correction_placeholder()}
                        size="sm"
                        on:select={(e) => {
                          const item = e.detail.selectedItem as
                            | ComboBoxItem
                            | undefined;
                          if (item) {
                            onManualCorrection?.(entity, item.text);
                          }
                        }}
                      />
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <ul class="entity-list">
                {#each unknowns as entity (entity)}
                  <li class="entity-item">{entity}</li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="join-status-zone">
      {#if displayedNotificationState.hasBlockingErrors}
        <div class="notifications-row">
          <div class="notification-slot">
            <InlineNotification
              title={m.join_error_detected_title()}
              subtitle={m.join_error_detected_subtitle()}
              kind="warning"
              lowContrast
            />
          </div>

          <div class="notification-slot">
            {#if displayedNotificationState.showCorrectionNotification}
              <InlineNotification
                title={m.join_correction_title()}
                subtitle={m.join_correction_desc()}
                kind="info"
                lowContrast
              >
                <svelte:fragment slot="actions">
                  <NotificationActionButton on:click={onApplyCorrections}>
                    {m.join_correction_button()}
                  </NotificationActionButton>
                </svelte:fragment>
              </InlineNotification>
            {:else}
              <div class="notification-placeholder" aria-hidden="true"></div>
            {/if}
          </div>
        </div>
      {:else if displayedNotificationState.showSuccessNotification}
        <div class="notification-success">
          <span class="notification-success-icon">
            <CheckmarkFilled size={20} />
          </span>
          <span class="notification-success-text"
            >{m.join_finalized_message()}</span
          >
        </div>
      {:else if displayedNotificationState.showValidationNotification}
        <div class="notification-validation">
          <div class="notification-title">{m.join_validation_title()}</div>
          <p class="notification-message">
            {m.join_validation_desc()}
          </p>
          <Button kind="primary" size="small" on:click={onFinalizeJoin}
            >{m.join_validation_button()}</Button
          >
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Section Container */
  .join-assisted-section {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding-top: 20px;
  }

  .join-assisted-content {
    min-height: clamp(320px, 40vh, 500px);
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: opacity 120ms ease-out;
  }

  .join-assisted-content.is-loading {
    opacity: 0.75;
    pointer-events: none;
  }

  /* Header */
  .section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 0 16px 0;
  }

  .section-header-icon {
    display: flex;
    align-items: center;
    color: #525252;
  }

  .section-title {
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.25rem;
    color: #003a6d;
  }

  /* Category rows */
  .category-rows {
    display: flex;
    flex-direction: column;
  }

  .category-row {
    border-bottom: 1px solid #e0e0e0;
  }

  .category-row:first-child {
    border-top: 1px solid #e0e0e0;
  }

  .category-row-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 12px 16px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font: inherit;
    transition: background-color 0.15s;
  }

  .category-row-header:hover {
    background-color: #f4f4f4;
  }

  .category-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .icon-success :global(svg) {
    fill: #198038;
  }

  .icon-warning :global(svg) {
    fill: #f1c21b;
  }

  .icon-warning-alt :global(svg) {
    fill: #f1c21b;
  }

  .icon-error :global(svg) {
    fill: #da1e28;
  }

  /* Count badge (filled background + bottom border) */
  .category-count {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 4.5ch;
    width: 4.5ch;
    padding: 2px 6px;
    font-weight: 700;
    font-size: 0.875rem;
    line-height: 1.25rem;
    border-bottom: 2.5px solid;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .count-success {
    color: #198038;
    background-color: #defbe6;
    border-bottom-color: #198038;
  }

  .count-warning {
    color: #8e6a00;
    background-color: #fcf4d6;
    border-bottom-color: #8e6a00;
  }

  .count-warning-alt {
    color: #da1e28;
    background-color: #fff1f1;
    border-bottom-color: #da1e28;
  }

  .count-error {
    color: #da1e28;
    background-color: #fff1f1;
    border-bottom-color: #da1e28;
  }

  /* Category label */
  .category-label {
    flex: 1;
    font-weight: 400;
    font-size: 0.875rem;
    line-height: 1.25rem;
  }

  .label-success {
    color: #044317;
  }

  .label-warning {
    color: #8e6a00;
  }

  .label-warning-alt {
    color: #003a6d;
  }

  .label-error {
    color: #003a6d;
  }

  .category-chevron {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: #161616;
  }

  /* Category body (expanded content) */
  .category-body {
    padding: 0 16px 16px;
  }

  .category-body-text {
    font-size: 0.8125rem;
    line-height: 1.25rem;
    color: #525252;
    margin: 0;
  }

  /* Unrecognized correction table */
  .unrecognized-correction-table {
    display: flex;
    flex-direction: column;
    border-radius: 4px;
    overflow: hidden;
    background-color: #fff1f1;
  }

  .unrecognized-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    border-top: 1px solid #e0e0e0;
    min-height: 48px;
  }

  .unrecognized-row:first-child {
    border-top: none;
  }

  .unrecognized-cell.cell-data {
    flex: 1;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: #161616;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .unrecognized-cell.cell-arrow {
    flex-shrink: 0;
    font-size: 0.875rem;
    color: #8d8d8d;
  }

  .unrecognized-cell.cell-combobox {
    flex: 1;
    overflow: visible;
  }

  .unrecognized-cell.cell-combobox :global(.bx--list-box) {
    height: 32px;
    background-color: var(--cds-field-01, #ffffff);
  }

  .unrecognized-cell.cell-combobox :global(.bx--text-input) {
    height: 32px;
    padding: 0 2rem 0 0.75rem;
    font-size: 0.875rem;
  }

  .unrecognized-cell.cell-combobox :global(.bx--label) {
    display: none;
  }

  /* Entity list for duplicates/unrecognized */
  .entity-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .entity-item {
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: #161616;
    padding: 10px 16px;
    background-color: #f4f4f4;
    border-bottom: 1px solid #e0e0e0;
  }

  .entity-item:last-child {
    border-bottom: none;
  }

  /* Correction Table */
  .join-table {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 4px;
    background-color: #dbedf8;
  }

  .table-header {
    display: flex;
    align-items: center;
    gap: 12px;
    background-color: #dbedf8;
    padding: 10px 16px;
    min-height: 40px;
  }

  .table-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }

  .table-header-right {
    display: flex;
    align-items: center;
    flex: 1;
  }

  .table-header-label {
    font-weight: 600;
    font-size: 0.875rem;
    line-height: 1.125rem;
    color: #161616;
  }

  .table-row {
    display: flex;
    align-items: center;
    background-color: #dbedf8;
    border-top: 1px solid #c6dde8;
    padding: 10px 16px;
    min-height: 48px;
    gap: 10px;
  }

  .table-cell {
    font-weight: 400;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: #161616;
  }

  .cell-data {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-equals {
    flex-shrink: 0;
    font-weight: 700;
    font-size: 0.75rem;
    color: #ffffff;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background-color: #009d9a;
    border-radius: 50%;
  }

  .cell-select {
    flex: 1;
    overflow: visible;
  }

  .cell-select :global(.bx--select) {
    margin: 0;
  }

  .cell-select :global(.bx--select-input) {
    height: 32px;
    padding: 0 2rem 0 0.75rem;
    font-size: 0.875rem;
    background-color: var(--cds-field-01, #ffffff);
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
  }

  .cell-select :global(.bx--select__arrow) {
    height: 32px;
  }

  .cell-select :global(.bx--label) {
    display: none;
  }

  /* Notifications */
  .notifications-row {
    display: flex;
    gap: 12px;
    align-items: stretch;
  }

  .notification-slot {
    flex: 1;
    min-width: 0;
    min-height: 108px;
    display: flex;
  }

  .join-status-zone {
    flex-shrink: 0;
    min-height: 128px;
    padding-top: 12px;
  }

  .notifications-row :global(.bx--inline-notification) {
    flex: 1 1 auto;
    max-width: none;
    margin: 0;
    min-height: 108px;
  }

  .notification-placeholder {
    width: 100%;
    min-height: 108px;
    background: transparent;
  }

  .notification-success {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px;
    background-color: #defbe6;
    border-left: 3px solid #24a148;
  }

  .notification-success-icon :global(svg) {
    fill: #198038;
  }

  .notification-success-text {
    font-weight: 600;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: #044317;
  }

  .notification-validation {
    padding: 16px;
    background-color: #defbe6;
    border-left: 3px solid #24a148;
  }

  .notification-title {
    font-weight: 600;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: #161616;
    margin-bottom: 4px;
  }

  .notification-message {
    font-weight: 400;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: #525252;
    margin-bottom: 8px;
  }
</style>
