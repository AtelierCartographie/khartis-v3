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
  import type { JoinStats } from './join-accordion.types';

  interface Props {
    stats: JoinStats;
    linkedVariableName?: string;
    showCorrectionTable?: boolean;
    onMappingChange?: (index: number, value: string) => void;
    onApplyCorrections?: () => void;
    onFinalizeJoin?: () => void;
  }

  const {
    stats,
    linkedVariableName,
    showCorrectionTable = false,
    onMappingChange,
    onApplyCorrections,
    onFinalizeJoin
  }: Props = $props();

  let joinedExpanded = $state(false);
  let toVerifyExpanded = $state(true);
  let duplicatesExpanded = $state(false);
  let unrecognizedExpanded = $state(false);

  const joinedEntities = $derived(
    stats.entities.filter((e) => e.status === 'joined')
  );
  const toVerifyEntities = $derived(
    stats.entities.filter((e) => e.status === 'to_verify')
  );
  const duplicateEntities = $derived(
    stats.entities.filter((e) => e.status === 'duplicate')
  );
  const unrecognizedEntities = $derived(
    stats.entities.filter((e) => e.status === 'unrecognized')
  );

  const hasErrors = $derived(
    stats.toVerifyCount > 0 ||
      stats.duplicateCount > 0 ||
      stats.unrecognizedCount > 0
  );

  const canFinalize = $derived(
    stats.joinedCount > 0 && stats.toVerifyCount === 0
  );
</script>

<div class="join-stats-accordion">
  <!-- Joined Entities -->
  <div class="accordion-item joined">
    <button
      class="accordion-header"
      onclick={() => (joinedExpanded = !joinedExpanded)}
    >
      <div class="status-icon">
        <CheckmarkFilled size={20} class="icon-success" />
      </div>
      <span class="status-text"
        >{m.join_entities_joined({ count: stats.joinedCount })}</span
      >
      <div class="expand-icon">
        {#if joinedExpanded}<ChevronUp />{:else}<ChevronDown />{/if}
      </div>
    </button>
    {#if joinedExpanded}
      <div class="accordion-content">
        {#if joinedEntities.length > 0}
          <ul class="entities-list joined-list">
            {#each joinedEntities as entity (entity.dataValue)}
              <li>{entity.dataValue}</li>
            {/each}
          </ul>
        {:else}
          <p class="helper-text">{m.join_entities_joined_desc()}</p>
        {/if}
      </div>
    {/if}
  </div>

  <!-- To Verify Entities -->
  <div class="accordion-item to-verify">
    <button
      class="accordion-header"
      onclick={() => (toVerifyExpanded = !toVerifyExpanded)}
    >
      <div class="status-icon">
        <WarningFilled size={20} class="icon-warning" />
      </div>
      <span class="status-text"
        >{m.join_entities_to_verify({ count: stats.toVerifyCount })}</span
      >
      <div class="expand-icon">
        {#if toVerifyExpanded}<ChevronUp />{:else}<ChevronDown />{/if}
      </div>
    </button>
    {#if toVerifyExpanded && stats.toVerifyCount > 0}
      <div class="accordion-content">
        {#if showCorrectionTable && toVerifyEntities.some((e) => e.basemapOptions)}
          <div class="join-table">
            <div class="head">
              <div class="col a">
                {m.join_data_column()}
                {#if linkedVariableName}
                  <Tag type="cyan" size="sm">{linkedVariableName}</Tag>
                {/if}
              </div>
              <div class="col b">{m.join_basemap_column()}</div>
            </div>
            {#each toVerifyEntities as entity, i (entity.dataValue)}
              {#if entity.basemapOptions}
                <div class="join-row">
                  <div class="col a">{entity.dataValue}</div>
                  <div class="col eq">=</div>
                  <div class="col b">
                    <Select
                      id={`join-${i}`}
                      labelText=""
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
          <ul class="entities-list verify-list">
            {#each toVerifyEntities as entity (entity.dataValue)}
              <li>
                <span class="entity-value">{entity.dataValue}</span>
                {#if entity.matches && entity.matches.length > 0}
                  <span class="entity-matches"
                    >→ {entity.matches.join(', ')}</span
                  >
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Duplicate Entities -->
  <div class="accordion-item duplicates">
    <button
      class="accordion-header"
      onclick={() => (duplicatesExpanded = !duplicatesExpanded)}
    >
      <div class="status-icon">
        <WarningAltFilled size={20} class="icon-error" />
      </div>
      <span class="status-text"
        >{m.join_entities_duplicate({ count: stats.duplicateCount })}</span
      >
      <div class="expand-icon">
        {#if duplicatesExpanded}<ChevronUp />{:else}<ChevronDown />{/if}
      </div>
    </button>
    {#if duplicatesExpanded && stats.duplicateCount > 0}
      <div class="accordion-content">
        <ul class="entities-list">
          {#each duplicateEntities as entity (entity.dataValue)}
            <li>{entity.dataValue}</li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>

  <!-- Unrecognized Entities -->
  <div class="accordion-item unrecognized">
    <button
      class="accordion-header"
      onclick={() => (unrecognizedExpanded = !unrecognizedExpanded)}
    >
      <div class="status-icon">
        <ErrorFilled size={20} class="icon-error" />
      </div>
      <span class="status-text"
        >{m.join_entities_unrecognized({
          count: stats.unrecognizedCount
        })}</span
      >
      <div class="expand-icon">
        {#if unrecognizedExpanded}<ChevronUp />{:else}<ChevronDown />{/if}
      </div>
    </button>
    {#if unrecognizedExpanded && stats.unrecognizedCount > 0}
      <div class="accordion-content">
        <ul class="entities-list">
          {#each unrecognizedEntities as entity (entity.dataValue)}
            <li>{entity.dataValue}</li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</div>

{#if hasErrors}
  <InlineNotification
    title={m.join_error_detected_title()}
    subtitle={m.join_error_detected_subtitle()}
    kind="warning"
    lowContrast
    hideCloseButton={false}
  />
{/if}

{#if stats.toVerifyCount > 0 && onApplyCorrections}
  <div class="correction">
    <div class="title">{m.join_correction_title()}</div>
    <p>{m.join_correction_desc()}</p>
    <Button kind="secondary" size="small" on:click={onApplyCorrections}>
      {m.join_correction_button()}
    </Button>
  </div>
{:else if canFinalize && onFinalizeJoin}
  <div class="validation">
    <div class="validation-title">{m.join_validation_title()}</div>
    <p>{m.join_validation_desc()}</p>
    <Button kind="primary" size="small" on:click={onFinalizeJoin}>
      {m.join_validation_button()}
    </Button>
  </div>
{/if}

<style>
  .join-stats-accordion {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background-color: var(--cds-border-subtle);
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: var(--cds-spacing-04);
  }

  .accordion-item {
    background-color: var(--cds-layer-01);
  }

  .accordion-header {
    display: flex;
    align-items: center;
    width: 100%;
    padding: var(--cds-spacing-04);
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
  }

  .accordion-header:hover {
    background-color: var(--cds-layer-hover-01);
  }

  .status-icon {
    margin-right: var(--cds-spacing-03);
    display: flex;
    align-items: center;
  }

  .status-icon :global(.icon-success) {
    color: var(--cds-support-success);
  }

  .status-icon :global(.icon-warning) {
    color: var(--cds-support-warning);
  }

  .status-icon :global(.icon-error) {
    color: var(--cds-support-error);
  }

  .status-text {
    flex: 1;
    font-size: 0.875rem;
    color: var(--cds-text-01);
  }

  .expand-icon {
    color: var(--cds-icon-01);
  }

  .accordion-content {
    padding: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
    background-color: var(--cds-layer-01);
  }

  .entities-list {
    margin: 0;
    padding-left: 1.2rem;
    font-size: 0.8125rem;
    color: var(--cds-text-02);
    max-height: 200px;
    overflow-y: auto;
  }

  .entities-list li {
    margin-bottom: var(--cds-spacing-02);
  }

  .verify-list li {
    display: flex;
    gap: var(--cds-spacing-03);
    flex-wrap: wrap;
  }

  .entity-value {
    font-weight: 500;
    color: var(--cds-text-01);
  }

  .entity-matches {
    color: var(--cds-support-warning);
    font-size: 0.75rem;
  }

  .helper-text {
    color: var(--cds-text-secondary);
    font-size: 0.875rem;
    margin: 0;
  }

  .join-table {
    border: 1px solid var(--cds-border-subtle);
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: var(--cds-spacing-05);
  }

  .join-table .head {
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: var(--cds-layer-accent-01);
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    font-weight: 600;
  }

  .join-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
    align-items: center;
  }

  .correction {
    border-left: 4px solid var(--cds-focus);
    background: var(--cds-layer);
    padding: var(--cds-spacing-04);
    margin-top: var(--cds-spacing-05);
    border-radius: 4px;
  }

  .correction .title {
    font-weight: 700;
    margin-bottom: var(--cds-spacing-03);
  }

  .validation {
    margin-top: var(--cds-spacing-04);
    padding: var(--cds-spacing-04);
    background-color: var(--cds-layer-02);
    border-radius: 4px;
    border-left: 4px solid var(--cds-support-success);
  }

  .validation-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-support-success);
    margin-bottom: var(--cds-spacing-02);
  }

  .validation p,
  .correction p {
    font-size: 0.8125rem;
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-03);
  }
</style>
