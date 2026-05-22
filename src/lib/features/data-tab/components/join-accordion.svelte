<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    InlineNotification,
    Select,
    SelectItem,
    Tag
  } from 'carbon-components-svelte';
  import {
    CheckmarkFilled,
    ChevronDown,
    ChevronUp,
    ErrorFilled,
    WarningAltFilled,
    WarningFilled
  } from 'carbon-icons-svelte';
  import { JoinStatus } from '$lib/features/commons/constants/ui.constants';
  import { canFinalizeJoin } from '../utils/join-validation.utils';
  import type { JoinStats } from '../types';

  interface Props {
    stats: JoinStats;
    linkedVariableName?: string;
    showCorrectionTable?: boolean;
    onMappingChange?: (index: number, value: string) => void;
    onFinalizeJoin?: () => void;
    onIgnoreEntity?: (dataValue: string) => void;
    onRestoreEntity?: (dataValue: string) => void;
  }

  const {
    stats,
    linkedVariableName,
    showCorrectionTable = false,
    onMappingChange,
    onFinalizeJoin,
    onIgnoreEntity,
    onRestoreEntity
  }: Props = $props();

  let joinedExpanded = $state(false);
  let toVerifyExpanded = $state(true);
  let duplicatesExpanded = $state(false);
  let unrecognizedExpanded = $state(false);
  let ignoredExpanded = $state(false);

  const joinedEntities = $derived(
    stats.entities.filter((e) => e.status === JoinStatus.JOINED)
  );
  const toVerifyEntities = $derived(
    stats.entities.filter((e) => e.status === JoinStatus.TO_VERIFY)
  );
  const duplicateEntities = $derived(
    stats.entities.filter((e) => e.status === JoinStatus.DUPLICATE)
  );
  const unrecognizedEntities = $derived(
    stats.entities.filter((e) => e.status === JoinStatus.UNRECOGNIZED)
  );
  const ignoredEntities = $derived(
    stats.entities.filter((e) => e.status === JoinStatus.IGNORED)
  );
  const ignoredCount = $derived(stats.ignoredCount ?? ignoredEntities.length);

  const hasErrors = $derived(
    stats.toVerifyCount > 0 ||
      stats.duplicateCount > 0 ||
      stats.unrecognizedCount > 0
  );

  const canFinalize = $derived(canFinalizeJoin(stats));
</script>

<div class="join-stats-accordion">
  <div class="category-rows">
    <div class="category-row">
      <button
        type="button"
        class="category-row-header"
        onclick={() => (joinedExpanded = !joinedExpanded)}
        aria-expanded={joinedExpanded}
      >
        <span class="category-icon icon-success">
          <CheckmarkFilled size={20} />
        </span>
        <div class="category-count count-success">{stats.joinedCount}</div>
        <span class="category-label label-success">
          {m.join_entities_joined({ count: stats.joinedCount })}
        </span>
        <span class="category-chevron">
          {#if joinedExpanded}<ChevronUp size={20} />{:else}<ChevronDown
              size={20}
            />{/if}
        </span>
      </button>
      {#if joinedExpanded}
        <div class="category-body">
          {#if joinedEntities.length > 0}
            <ul class="entity-list">
              {#each joinedEntities as entity (entity.dataValue)}
                <li class="entity-item">{entity.dataValue}</li>
              {/each}
            </ul>
          {:else}
            <p class="helper-text">{m.join_entities_joined_desc()}</p>
          {/if}
        </div>
      {/if}
    </div>

    <div class="category-row">
      <button
        type="button"
        class="category-row-header"
        onclick={() => (toVerifyExpanded = !toVerifyExpanded)}
        aria-expanded={toVerifyExpanded}
      >
        <span class="category-icon icon-warning">
          <WarningFilled size={20} />
        </span>
        <div class="category-count count-warning">{stats.toVerifyCount}</div>
        <span class="category-label label-warning">
          {m.join_entities_to_verify({ count: stats.toVerifyCount })}
        </span>
        <span class="category-chevron">
          {#if toVerifyExpanded}<ChevronUp size={20} />{:else}<ChevronDown
              size={20}
            />{/if}
        </span>
      </button>
      {#if toVerifyExpanded && stats.toVerifyCount > 0}
        <div class="category-body">
          {#if showCorrectionTable && toVerifyEntities.some((e) => e.basemapOptions)}
            <div class="join-table">
              <div class="table-header">
                <div class="table-header-left">
                  <span class="table-header-label">{m.join_data_column()}</span>
                  {#if linkedVariableName}
                    <Tag type="cyan" size="sm">{linkedVariableName}</Tag>
                  {/if}
                </div>
                <div class="table-header-right">
                  <span class="table-header-label"
                    >{m.join_basemap_column()}</span
                  >
                </div>
              </div>
              {#each toVerifyEntities as entity, i (entity.dataValue)}
                {#if entity.basemapOptions}
                  <div class="table-row">
                    <div class="table-cell cell-data">{entity.dataValue}</div>
                    <div class="table-cell cell-equals">
                      {m.symbol_equals()}
                    </div>
                    <div class="table-cell cell-select">
                      <Select
                        id={`join-${i}`}
                        labelText={m.join_basemap_column()}
                        hideLabel
                        selected={entity.selectedMapping}
                        on:change={(e) => {
                          const target = e.target as HTMLSelectElement;
                          onMappingChange?.(
                            i,
                            target?.value || entity.selectedMapping || ''
                          );
                        }}
                        size="xl"
                      >
                        {#each entity.basemapOptions as opt (opt)}
                          <SelectItem value={opt} text={opt} />
                        {/each}
                      </Select>
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          {:else}
            <ul class="entity-list">
              {#each toVerifyEntities as entity (entity.dataValue)}
                <li class="entity-item">
                  <span class="entity-value">{entity.dataValue}</span>
                  {#if entity.matches && entity.matches.length > 0}
                    <span class="entity-matches"
                      >{m.separator_arrow()}{entity.matches.join(
                        m.separator_comma_space()
                      )}</span
                    >
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </div>

    {#if stats.duplicateCount > 0}
      <div class="category-row">
        <button
          type="button"
          class="category-row-header"
          onclick={() => (duplicatesExpanded = !duplicatesExpanded)}
          aria-expanded={duplicatesExpanded}
        >
          <span class="category-icon icon-warning-alt">
            <WarningAltFilled size={20} />
          </span>
          <div class="category-count count-warning-alt">
            {stats.duplicateCount}
          </div>
          <span class="category-label label-warning-alt">
            {m.join_entities_duplicate({ count: stats.duplicateCount })}
          </span>
          <span class="category-chevron">
            {#if duplicatesExpanded}<ChevronUp size={20} />{:else}<ChevronDown
                size={20}
              />{/if}
          </span>
        </button>
        {#if duplicatesExpanded}
          <div class="category-body">
            <ul class="entity-list">
              {#each duplicateEntities as entity (entity.dataValue)}
                <li class="entity-item">{entity.dataValue}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}

    <div class="category-row">
      <button
        type="button"
        class="category-row-header"
        onclick={() => (unrecognizedExpanded = !unrecognizedExpanded)}
        aria-expanded={unrecognizedExpanded}
      >
        <span class="category-icon icon-error">
          <ErrorFilled size={20} />
        </span>
        <div class="category-count count-error">{stats.unrecognizedCount}</div>
        <span class="category-label label-error">
          {m.join_entities_unrecognized({ count: stats.unrecognizedCount })}
        </span>
        <span class="category-chevron">
          {#if unrecognizedExpanded}<ChevronUp size={20} />{:else}<ChevronDown
              size={20}
            />{/if}
        </span>
      </button>
      {#if unrecognizedExpanded && stats.unrecognizedCount > 0}
        <div class="category-body">
          <ul class="entity-list">
            {#each unrecognizedEntities as entity (entity.dataValue)}
              <li class="entity-item entity-item--with-action">
                <span>{entity.dataValue}</span>
                {#if onIgnoreEntity}
                  <Button
                    kind="ghost"
                    size="small"
                    on:click={() => onIgnoreEntity?.(entity.dataValue)}
                  >
                    {m.join_ignore_action()}
                  </Button>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>

    {#if ignoredCount > 0}
      <div class="category-row">
        <button
          type="button"
          class="category-row-header"
          onclick={() => (ignoredExpanded = !ignoredExpanded)}
          aria-expanded={ignoredExpanded}
        >
          <span class="category-icon icon-warning-alt">
            <WarningAltFilled size={20} />
          </span>
          <div class="category-count count-warning-alt">{ignoredCount}</div>
          <span class="category-label label-warning-alt">
            {m.join_entities_ignored({ count: ignoredCount })}
          </span>
          <span class="category-chevron">
            {#if ignoredExpanded}<ChevronUp size={20} />{:else}<ChevronDown
                size={20}
              />{/if}
          </span>
        </button>
        {#if ignoredExpanded}
          <div class="category-body">
            <ul class="entity-list">
              {#each ignoredEntities as entity (entity.dataValue)}
                <li class="entity-item entity-item--with-action">
                  <span>{entity.dataValue}</span>
                  {#if onRestoreEntity}
                    <Button
                      kind="ghost"
                      size="small"
                      on:click={() => onRestoreEntity?.(entity.dataValue)}
                    >
                      {m.join_restore_action()}
                    </Button>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="join-status-zone">
    {#if hasErrors}
      <InlineNotification
        title={m.join_error_detected_title()}
        subtitle={m.join_error_detected_subtitle()}
        kind="warning"
        lowContrast
      />
    {:else if canFinalize && onFinalizeJoin}
      <div class="notification-validation">
        <div class="notification-title">{m.join_validation_title()}</div>
        <p class="notification-message">{m.join_validation_desc()}</p>
        <Button kind="primary" size="small" on:click={onFinalizeJoin}>
          {m.join_validation_button()}
        </Button>
      </div>
    {/if}
  </div>
</div>

<style>
  .join-stats-accordion {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* Category rows */
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
    background-color: var(--cds-layer-hover-01, #f4f4f4);
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

  /* Count badge */
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

  /* Category body */
  .category-body {
    padding: 0 16px 16px;
  }

  .helper-text {
    font-size: 0.8125rem;
    line-height: 1.25rem;
    color: #525252;
    margin: 0;
  }

  /* Entity list */
  .entity-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .entity-item {
    display: flex;
    gap: var(--cds-spacing-03);
    flex-wrap: wrap;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: #161616;
    padding: 10px 16px;
    background-color: var(--cds-layer-hover-01, #f4f4f4);
    border-bottom: 1px solid var(--cds-border-subtle-00, #e0e0e0);
  }

  .entity-item--with-action {
    align-items: center;
    justify-content: space-between;
  }

  .entity-item:last-child {
    border-bottom: none;
  }

  .entity-value {
    font-weight: 500;
    color: var(--cds-text-01);
  }

  .entity-matches {
    color: var(--cds-support-warning);
    font-size: 0.75rem;
  }

  /* Correction table */
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
