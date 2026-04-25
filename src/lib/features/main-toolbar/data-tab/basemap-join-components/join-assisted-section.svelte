<script lang="ts">
  import VariableBadge from '$lib/features/commons/components/variable-badge.svelte';
  import { dataTabActions } from '$lib/features/commons/store/data-tab.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    ComboBox,
    InlineNotification,
    Select,
    SelectItem
  } from 'carbon-components-svelte';
  import {
    CheckmarkFilled,
    ChevronDown,
    ChevronUp,
    ErrorFilled,
    Information,
    MagicWand,
    Misuse,
    Renew,
    WarningAltFilled,
    WarningFilled
  } from 'carbon-icons-svelte';
  import { InfoPopover } from '$lib/features/commons/components/viz-controls';

  type IgnoreSource = 'joined' | 'to_verify' | 'unrecognized';

  interface JoinRow {
    dataValue: string;
    selectedMapping: string;
    basemapOptions: string[];
  }

  interface ComboBoxItem {
    id: string;
    text: string;
  }

  interface JoinedEntityRow {
    dataValue: string;
    basemapValue: string;
  }

  interface LineReference {
    dataValue: string;
    lines: number[];
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
    joinedEntitiesList?: JoinedEntityRow[];
    duplicateLines?: LineReference[];
    ignoredEntities?: LineReference[];
    onFinalizeJoin: () => void;
    onManualCorrection?: (dataValue: string, basemapValue: string) => void;
    onIgnoreEntity?: (
      dataValue: string,
      source: IgnoreSource,
      basemapValue?: string
    ) => void;
    onRestoreEntity?: (dataValue: string) => void;
    onValidateEntity?: (dataValue: string, basemapValue: string) => void;
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
    joinedEntitiesList = [],
    duplicateLines = [],
    ignoredEntities = [],
    onFinalizeJoin,
    onManualCorrection,
    onIgnoreEntity,
    onRestoreEntity,
    onValidateEntity
  }: Props = $props();

  const basemapComboBoxItems = $derived<ComboBoxItem[]>(
    basemapValues.map((value) => ({ id: value, text: value }))
  );

  const duplicateCount = $derived(duplicates.length);
  const unrecognizedCount = $derived(unknowns.length);
  const ignoredCount = $derived(ignoredEntities.length);

  const deduplicatedJoinRows = $derived(
    joinRows.map((row) => ({
      ...row,
      basemapOptions: [...new Set(row.basemapOptions)]
    }))
  );

  const duplicateLinesByValue = $derived<Record<string, number[]>>(
    Object.fromEntries(duplicateLines.map((d) => [d.dataValue, d.lines]))
  );

  let joinedExpanded = $state(false);
  let toVerifyExpanded = $state(true);
  let duplicatesExpanded = $state(false);
  let unrecognizedExpanded = $state(false);
  let ignoredExpanded = $state(false);
  let footerDismissed = $state(false);

  const hasBlockingErrors = $derived(
    toVerifyCount > 0 || unrecognizedCount > 0 || duplicateCount > 0
  );
  const showSuccessNotification = $derived(
    !hasBlockingErrors && joinedCount > 0 && joinFinalized
  );
  const showValidationNotification = $derived(
    !hasBlockingErrors && joinedCount > 0 && !joinFinalized
  );
  const showAttentionFooter = $derived(hasBlockingErrors && !footerDismissed);

  interface NotificationSnapshot {
    hasBlockingErrors: boolean;
    showSuccessNotification: boolean;
    showValidationNotification: boolean;
  }

  const currentNotificationState = $derived<NotificationSnapshot>({
    hasBlockingErrors,
    showSuccessNotification,
    showValidationNotification
  });

  function resetToDefaultExpanded(): void {
    joinedExpanded = false;
    toVerifyExpanded = true;
    duplicatesExpanded = false;
    unrecognizedExpanded = false;
    ignoredExpanded = false;
  }

  let wasLoading = $state(false);
  let notificationSnapshot = $state<NotificationSnapshot>({
    hasBlockingErrors: false,
    showSuccessNotification: false,
    showValidationNotification: false
  });

  const displayedNotificationState = $derived(
    loading ? notificationSnapshot : currentNotificationState
  );

  $effect(() => {
    if (loading && !wasLoading) {
      resetToDefaultExpanded();
    }

    wasLoading = loading;
  });

  $effect(() => {
    if (!loading) {
      notificationSnapshot = currentNotificationState;
    }
  });

  $effect(() => {
    if (hasBlockingErrors) {
      footerDismissed = false;
    }
  });

  function handleIgnore(
    dataValue: string,
    source: IgnoreSource,
    basemapValue?: string
  ): void {
    onIgnoreEntity?.(dataValue, source, basemapValue);
  }

  function handleRestore(dataValue: string): void {
    onRestoreEntity?.(dataValue);
  }

  function handleValidate(dataValue: string, basemapValue: string): void {
    if (!basemapValue) return;
    onValidateEntity?.(dataValue, basemapValue);
  }
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
            {#if joinedEntitiesList.length > 0}
              <div class="join-table join-table-success">
                <div class="table-header">
                  <div class="table-header-left">
                    <span class="table-header-label"
                      >{m.join_data_column()}</span
                    >
                    {#if linkedVariableName}
                      <VariableBadge
                        label={linkedVariableName}
                        type="geo-ref"
                      />
                    {/if}
                  </div>
                  <div class="table-header-right">
                    <span class="table-header-label"
                      >{m.join_basemap_column()}</span
                    >
                  </div>
                </div>
                <div class="join-table-scroll">
                  {#each joinedEntitiesList as row (row.dataValue)}
                    <div class="table-row">
                      <div class="table-cell cell-data" title={row.dataValue}>
                        {row.dataValue}
                      </div>
                      <div class="table-cell cell-equals">=</div>
                      <div class="table-cell cell-select">
                        <Select
                          id={`joined-${row.dataValue}`}
                          labelText=""
                          selected={row.basemapValue}
                          size="sm"
                          disabled
                        >
                          <SelectItem
                            value={row.basemapValue}
                            text={row.basemapValue}
                          />
                        </Select>
                      </div>
                      <div class="row-actions">
                        <button
                          type="button"
                          class="row-action"
                          aria-label={m.join_action_info()}
                        >
                          <Information size={20} />
                        </button>
                        <button
                          type="button"
                          class="row-action"
                          aria-label={m.join_action_ignore()}
                          onclick={() =>
                            handleIgnore(
                              row.dataValue,
                              'joined',
                              row.basemapValue
                            )}
                        >
                          <Misuse size={20} />
                        </button>
                        <span
                          class="row-action row-action-done"
                          aria-label={m.join_action_validated()}
                        >
                          <CheckmarkFilled size={20} />
                        </span>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {:else}
              <p class="category-body-text">
                {m.join_entities_joined_desc()}
              </p>
            {/if}
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
            <div class="join-table join-table-warning">
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
                  <div class="row-actions">
                    <button
                      type="button"
                      class="row-action"
                      aria-label={m.join_action_info()}
                    >
                      <Information size={20} />
                    </button>
                    <button
                      type="button"
                      class="row-action"
                      aria-label={m.join_action_ignore()}
                      onclick={() =>
                        handleIgnore(
                          row.dataValue,
                          'to_verify',
                          row.selectedMapping
                        )}
                    >
                      <Misuse size={20} />
                    </button>
                    <button
                      type="button"
                      class="row-action row-action-validate"
                      aria-label={m.join_action_validate()}
                      disabled={!row.selectedMapping}
                      onclick={() =>
                        handleValidate(row.dataValue, row.selectedMapping)}
                    >
                      <CheckmarkFilled size={20} />
                    </button>
                  </div>
                </div>
              {/each}
            </div>
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
            <div class="join-table join-table-error">
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
              {#each unknowns as entity (entity)}
                <div class="table-row">
                  <div class="table-cell cell-data">{entity}</div>
                  <div class="table-cell cell-equals">=</div>
                  <div class="table-cell cell-select">
                    {#if basemapComboBoxItems.length > 0 && onManualCorrection}
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
                    {:else}
                      <Select
                        id={`unrecognized-${entity}`}
                        labelText=""
                        size="sm"
                        disabled
                      >
                        <SelectItem
                          value=""
                          text={m.join_unrecognized_correction_placeholder()}
                        />
                      </Select>
                    {/if}
                  </div>
                  <div class="row-actions">
                    <button
                      type="button"
                      class="row-action"
                      aria-label={m.join_action_info()}
                    >
                      <Information size={20} />
                    </button>
                    <button
                      type="button"
                      class="row-action"
                      aria-label={m.join_action_ignore()}
                      onclick={() => handleIgnore(entity, 'unrecognized')}
                    >
                      <Misuse size={20} />
                    </button>
                    <span
                      class="row-action row-action-disabled"
                      aria-label={m.join_action_validate_disabled()}
                    >
                      <CheckmarkFilled size={20} />
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      {#if duplicateCount > 0}
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
          {#if duplicatesExpanded}
            <div class="category-body">
              <div class="inline-banner inline-banner-error">
                {m.join_duplicates_explanation()}
              </div>
              <div class="join-table join-table-error">
                <div class="table-header">
                  <div class="table-header-left">
                    <span class="table-header-label"
                      >{m.join_data_column()}</span
                    >
                    {#if linkedVariableName}
                      <VariableBadge
                        label={linkedVariableName}
                        type="geo-ref"
                      />
                    {/if}
                  </div>
                  <div class="table-header-right">
                    <span class="table-header-label"
                      >{m.join_lines_column()}</span
                    >
                  </div>
                </div>
                {#each duplicates as entity (entity)}
                  <div class="table-row table-row-lines">
                    <div class="table-cell cell-data">{entity}</div>
                    <div class="table-cell cell-lines">
                      {#if duplicateLinesByValue[entity]?.length}
                        {duplicateLinesByValue[entity].join(', ')}
                      {:else}
                        &mdash;
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}

      {#if ignoredCount > 0}
        <div class="category-row category-row-ignored">
          <button
            class="category-row-header"
            onclick={() => (ignoredExpanded = !ignoredExpanded)}
            aria-expanded={ignoredExpanded}
          >
            <span class="category-icon icon-ignored">
              <Misuse size={20} />
            </span>
            <div class="category-count count-ignored">{ignoredCount}</div>
            <span class="category-label label-ignored"
              >{m.join_entities_ignored({ count: ignoredCount })}</span
            >
            <span class="category-chevron">
              {#if ignoredExpanded}
                <ChevronUp size={20} />
              {:else}
                <ChevronDown size={20} />
              {/if}
            </span>
          </button>
          {#if ignoredExpanded}
            <div class="category-body">
              <div class="inline-banner inline-banner-info">
                {m.join_ignored_explanation()}
              </div>
              <div class="join-table join-table-info">
                <div class="table-header">
                  <div class="table-header-left">
                    <span class="table-header-label"
                      >{m.join_data_column()}</span
                    >
                    {#if linkedVariableName}
                      <VariableBadge
                        label={linkedVariableName}
                        type="geo-ref"
                      />
                    {/if}
                  </div>
                  <div class="table-header-right">
                    <span class="table-header-label"
                      >{m.join_line_column()}</span
                    >
                  </div>
                </div>
                {#each ignoredEntities as entry (entry.dataValue)}
                  <div class="table-row table-row-lines">
                    <div class="table-cell cell-data">{entry.dataValue}</div>
                    <div class="table-cell cell-lines">
                      {#if entry.lines.length}
                        {entry.lines.join(', ')}
                      {:else}
                        &mdash;
                      {/if}
                    </div>
                    <div class="row-actions row-actions-compact">
                      <button
                        type="button"
                        class="row-action"
                        aria-label={m.join_action_restore()}
                        onclick={() => handleRestore(entry.dataValue)}
                      >
                        <Renew size={20} />
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="join-status-zone">
      {#if displayedNotificationState.showSuccessNotification}
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
      {:else if showAttentionFooter}
        <InlineNotification
          title={m.join_error_detected_title()}
          subtitle={m.join_error_detected_subtitle()}
          kind="warning"
          lowContrast
          on:close={() => (footerDismissed = true)}
        />
      {/if}
    </div>
  </div>
</div>

<style>
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

  .section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 0 16px 0;
  }

  .section-header-icon {
    display: flex;
    align-items: center;
    color: var(--cds-text-secondary, #525252);
  }

  .section-title {
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.25rem;
    color: #003a6d;
  }

  .category-rows {
    display: flex;
    flex-direction: column;
  }

  .category-row {
    border-bottom: 1px solid var(--cds-border-subtle-00, #e0e0e0);
  }

  .category-row:first-child {
    border-top: 1px solid var(--cds-border-subtle-00, #e0e0e0);
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

  .icon-warning :global(svg),
  .icon-warning-alt :global(svg) {
    fill: #f1c21b;
  }

  .icon-error :global(svg) {
    fill: #da1e28;
  }

  .icon-ignored :global(svg) {
    fill: #525252;
  }

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

  .count-warning-alt,
  .count-error {
    color: #da1e28;
    background-color: #fff1f1;
    border-bottom-color: #da1e28;
  }

  .count-ignored {
    color: #0043ce;
    background-color: #edf5ff;
    border-bottom-color: #0043ce;
  }

  .category-label {
    flex: 1;
    font-weight: 400;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: #003a6d;
  }

  .label-success {
    color: #044317;
  }

  .label-warning {
    color: #8e6a00;
  }

  .category-chevron {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: #161616;
  }

  .category-body {
    padding: 0 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .category-body-text {
    font-size: 0.8125rem;
    line-height: 1.25rem;
    color: #525252;
    margin: 0;
  }

  .inline-banner {
    padding: 10px 12px;
    font-size: 0.8125rem;
    line-height: 1.25rem;
    border-radius: 2px;
    border-left: 3px solid;
  }

  .inline-banner-error {
    background-color: #fff1f1;
    border-left-color: #da1e28;
    color: #161616;
  }

  .inline-banner-info {
    background-color: #edf5ff;
    border-left-color: #0043ce;
    color: #161616;
  }

  .join-table {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 4px;
  }

  .join-table-scroll {
    display: flex;
    flex-direction: column;
    max-height: 480px;
    overflow-y: auto;
  }

  .join-table-success {
    background-color: #defbe6;
  }

  .join-table-success .table-header,
  .join-table-success .table-row {
    background-color: #defbe6;
    border-top-color: #a7f0ba;
  }

  .join-table-warning {
    background-color: #fcf4d6;
  }

  .join-table-warning .table-header,
  .join-table-warning .table-row {
    background-color: #fcf4d6;
    border-top-color: #f1c21b;
  }

  .join-table-error {
    background-color: #fff1f1;
  }

  .join-table-error .table-header,
  .join-table-error .table-row {
    background-color: #fff1f1;
    border-top-color: #ffb3b8;
  }

  .join-table-info {
    background-color: #edf5ff;
  }

  .join-table-info .table-header,
  .join-table-info .table-row {
    background-color: #edf5ff;
    border-top-color: #a6c8ff;
  }

  .table-header {
    display: flex;
    align-items: center;
    gap: 12px;
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
    border-top: 1px solid transparent;
    padding: 8px 16px;
    min-height: 48px;
    gap: 10px;
  }

  .table-row-lines {
    min-height: 40px;
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
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background-color: #009d9a;
    border-radius: 50%;
  }

  .cell-select {
    flex: 1;
    overflow: visible;
    min-width: 0;
  }

  .cell-select :global(.bx--select),
  .cell-select :global(.bx--list-box) {
    margin: 0;
  }

  .cell-select :global(.bx--select-input),
  .cell-select :global(.bx--text-input) {
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

  .cell-lines {
    flex: 1;
    font-variant-numeric: tabular-nums;
    color: #525252;
  }

  .row-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .row-actions-compact {
    gap: 0;
  }

  .row-action {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--cds-icon-primary, #161616);
    cursor: pointer;
    padding: 0;
    border-radius: 2px;
    transition: background-color 0.15s;
  }

  .row-action:hover:not(.row-action-disabled):not(.row-action-done) {
    background-color: rgba(0, 0, 0, 0.05);
  }

  .row-action:focus-visible {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: -2px;
  }

  .row-action-validate {
    color: #161616;
  }

  .row-action[disabled] {
    color: var(--cds-icon-on-color-disabled, #c6c6c6);
    cursor: not-allowed;
  }

  .row-action[disabled] :global(svg) {
    fill: var(--cds-icon-on-color-disabled, #c6c6c6);
  }

  .row-action-done {
    color: #161616;
    cursor: default;
  }

  .row-action-done :global(svg) {
    fill: #161616;
  }

  .row-action-disabled {
    color: var(--cds-icon-on-color-disabled, #c6c6c6);
    cursor: not-allowed;
  }

  .row-action-disabled :global(svg) {
    fill: var(--cds-icon-on-color-disabled, #c6c6c6);
  }

  .join-status-zone {
    flex-shrink: 0;
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .join-status-zone :global(.bx--inline-notification) {
    max-width: none;
    margin: 0;
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
