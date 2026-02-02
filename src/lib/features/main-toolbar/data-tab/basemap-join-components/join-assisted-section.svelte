<script lang="ts">
  import { dataTabActions } from '$lib/features/commons/store/data-tab.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    Accordion,
    AccordionItem,
    Button,
    InlineNotification,
    Select,
    SelectItem,
    Tag
  } from 'carbon-components-svelte';
  import {
    CheckmarkFilled,
    ErrorFilled,
    MagicWand,
    WarningAltFilled,
    WarningFilled
  } from 'carbon-icons-svelte';

  interface JoinRow {
    dataValue: string;
    selectedMapping: string;
    basemapOptions: string[];
  }

  interface Props {
    joinRows: JoinRow[];
    duplicates: string[];
    unknowns: string[];
    joinedCount: number;
    toVerifyCount: number;
    linkedVariableName: string | undefined;
    onApplyCorrections: () => void;
    onFinalizeJoin: () => void;
  }

  let {
    joinRows,
    duplicates,
    unknowns,
    joinedCount,
    toVerifyCount,
    linkedVariableName,
    onApplyCorrections,
    onFinalizeJoin
  }: Props = $props();

  let joinedExpanded = $state(false);
  let toVerifyExpanded = $state(true);
  let duplicatesExpanded = $state(false);
  let unrecognizedExpanded = $state(false);

  const duplicateCount = $derived(duplicates.length);
  const unrecognizedCount = $derived(unknowns.length);
</script>

<div class="join-assisted-section">
  <!-- Header -->
  <div class="section-header">
    <MagicWand size={20} />
    <span class="section-title">{m.section_join_assisted()}</span>
  </div>

  <!-- Accordion -->
  <div class="join-stats-accordion">
    <Accordion>
      <!-- Entités jointes (Success) -->
      <AccordionItem
        open={joinedExpanded}
        on:click={() => (joinedExpanded = !joinedExpanded)}
      >
        <svelte:fragment slot="title">
          <div class="accordion-title">
            <CheckmarkFilled size={16} class="icon-success" />
            <div class="accordion-badge badge-success">
              <span class="badge-number">{joinedCount}</span>
            </div>
            <span class="accordion-label"
              >{m.join_entities_joined({ count: joinedCount })}</span
            >
          </div>
        </svelte:fragment>
        <p class="helper-text">
          {m.join_entities_joined_desc()}
        </p>
      </AccordionItem>

      <!-- Entités à vérifier (Warning) -->
      <AccordionItem
        open={toVerifyExpanded}
        on:click={() => (toVerifyExpanded = !toVerifyExpanded)}
      >
        <svelte:fragment slot="title">
          <div class="accordion-title">
            <WarningFilled size={16} class="icon-warning" />
            <div class="accordion-badge badge-warning">
              <span class="badge-number">{toVerifyCount}</span>
            </div>
            <span class="accordion-label"
              >{m.join_entities_to_verify({ count: toVerifyCount })}</span
            >
          </div>
        </svelte:fragment>
        <div class="accordion-content">
          <!-- Table -->
          <div class="join-table">
            <div class="table-header">
              <div class="table-header-cell">
                <span>{m.join_data_column()}</span>
                {#if linkedVariableName}
                  <Tag size="sm" class="variable-tag">{linkedVariableName}</Tag>
                {/if}
              </div>
              <div class="table-header-cell">{m.join_basemap_column()}</div>
            </div>
            {#each joinRows as row, i (i)}
              <div class="table-row">
                <div class="table-cell">{row.dataValue}</div>
                <div class="table-equals">=</div>
                <div class="table-cell">
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
                    size="xl"
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
      </AccordionItem>

      <!-- Entités en double (Doubles) -->
      <AccordionItem
        open={duplicatesExpanded}
        on:click={() => (duplicatesExpanded = !duplicatesExpanded)}
      >
        <svelte:fragment slot="title">
          <div class="accordion-title">
            <WarningAltFilled size={16} class="icon-error" />
            <div class="accordion-badge badge-error">
              <span class="badge-number">{duplicateCount}</span>
            </div>
            <span class="accordion-label"
              >{m.join_entities_duplicate({ count: duplicateCount })}</span
            >
          </div>
        </svelte:fragment>
        {#if duplicateCount > 0}
          <div class="accordion-content">
            <ul class="issues-list">
              {#each duplicates as d, idx (idx)}
                <li>{d}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </AccordionItem>

      <!-- Entités non reconnues (Error) -->
      <AccordionItem
        open={unrecognizedExpanded}
        on:click={() => (unrecognizedExpanded = !unrecognizedExpanded)}
      >
        <svelte:fragment slot="title">
          <div class="accordion-title">
            <ErrorFilled size={16} class="icon-error" />
            <div class="accordion-badge badge-error">
              <span class="badge-number">{unrecognizedCount}</span>
            </div>
            <span class="accordion-label"
              >{m.join_entities_unrecognized({
                count: unrecognizedCount
              })}</span
            >
          </div>
        </svelte:fragment>
        {#if unrecognizedCount > 0}
          <div class="accordion-content">
            <ul class="issues-list">
              {#each unknowns as u, idx (idx)}
                <li>{u}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </AccordionItem>
    </Accordion>
  </div>

  <!-- Notifications -->
  {#if toVerifyCount > 0 || duplicateCount > 0 || unrecognizedCount > 0}
    <InlineNotification
      title={m.join_error_detected_title()}
      subtitle={m.join_error_detected_subtitle()}
      kind="warning"
      lowContrast
      hideCloseButton={false}
    />
  {/if}

  {#if toVerifyCount > 0}
    <div class="notification-correction">
      <div class="notification-title">{m.join_correction_title()}</div>
      <p class="notification-message">
        {m.join_correction_desc()}
      </p>
      <Button kind="secondary" size="small" on:click={onApplyCorrections}
        >{m.join_correction_button()}</Button
      >
    </div>
  {:else if joinedCount > 0 && duplicateCount === 0 && unrecognizedCount === 0}
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

<style>
  /* Section Container */
  .join-assisted-section {
    margin-top: 24px;
    padding: 0 16px;
  }

  /* Header */
  .section-header {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 0 16px;
    margin-bottom: 16px;
  }

  .section-header :global(svg) {
    margin-top: 2px;
    flex-shrink: 0;
  }

  .section-title {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 400;
    font-size: 16px;
    line-height: 22px;
    color: #161616;
  }

  /* Accordion */
  .join-stats-accordion {
    margin-bottom: 16px;
  }

  .join-stats-accordion :global(.bx--accordion) {
    border: none;
  }

  .join-stats-accordion :global(.bx--accordion__item) {
    border-top: 1px solid #e0e0e0;
    border-bottom: 1px solid #c6c6c6;
  }

  .join-stats-accordion :global(.bx--accordion__item:first-child) {
    border-top: 1px solid #e0e0e0;
  }

  .join-stats-accordion :global(.bx--accordion__heading) {
    padding: 10px 16px;
  }

  .join-stats-accordion :global(.bx--accordion__content) {
    padding: 8px 48px 24px 16px;
  }

  /* Accordion Title */
  .accordion-title {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    flex: 1;
  }

  .accordion-title :global(.icon-success) {
    color: #24a148;
    margin-top: 4px;
    flex-shrink: 0;
  }

  .accordion-title :global(.icon-warning) {
    color: #f1c21b;
    margin-top: 4px;
    flex-shrink: 0;
  }

  .accordion-title :global(.icon-error) {
    color: #da1e28;
    margin-top: 4px;
    flex-shrink: 0;
  }

  /* Badge */
  .accordion-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 8px 2px 8px;
    border-radius: 4px;
    min-width: 24px;
    height: 22px;
  }

  .badge-success {
    background-color: #defbe6;
    border: 1px solid #24a148;
  }

  .badge-warning {
    background-color: #fcf4d6;
    border: 1px solid #f1c21b;
  }

  .badge-error {
    background-color: #fff1f1;
    border: 1px solid #da1e28;
  }

  .badge-number {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 600;
    font-size: 16px;
    line-height: 22px;
    color: #161616;
  }

  /* Label */
  .accordion-label {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 400;
    font-size: 16px;
    line-height: 22px;
    color: #00539a;
    margin-left: 4px;
  }

  /* Accordion Content */
  .accordion-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Table */
  .join-table {
    display: flex;
    flex-direction: column;
    border-radius: 4px;
    overflow: hidden;
  }

  .table-header {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    background-color: #cceeef;
    padding: 8px;
    min-height: 40px;
    align-items: center;
  }

  .table-header-cell {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 600;
    font-size: 14px;
    line-height: 20px;
    letter-spacing: 0.16px;
    color: #003a6d;
  }

  .table-header-cell :global(.variable-tag) {
    background-color: #9ef0f0 !important;
    border: 1px solid #08bdba;
    border-radius: 1000px;
    padding: 0 6px 2px 8px !important;
    height: 18px;
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 400;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: #005d5d !important;
  }

  .table-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 8px;
    background-color: #e5f6ff;
    border-bottom: 1px solid #bae6ff;
    padding: 8px;
    min-height: 32px;
    align-items: center;
  }

  .table-row:last-child {
    border-bottom: none;
  }

  .table-cell {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 400;
    font-size: 14px;
    line-height: 18px;
    letter-spacing: 0.16px;
    color: #003a6d;
  }

  .table-equals {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 600;
    font-size: 16px;
    line-height: 22px;
    color: #00539a;
    text-align: center;
    padding: 0 8px;
  }

  /* Issues List */
  .issues-list {
    margin: 0;
    padding-left: 1.2rem;
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 400;
    font-size: 14px;
    line-height: 18px;
    color: #161616;
  }

  /* Helper Text */
  .helper-text {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 400;
    font-size: 14px;
    line-height: 18px;
    letter-spacing: 0.16px;
    color: #525252;
    margin: 0;
  }

  /* Notifications */
  .notification-correction,
  .notification-validation {
    padding: 16px;
    margin-top: 16px;
    border-radius: 4px;
  }

  .notification-correction {
    background-color: #edf5ff;
    border-left: 3px solid #0043ce;
    box-shadow: 0px 2px 6px 0px rgba(0, 0, 0, 0.3);
  }

  .notification-validation {
    background-color: #defbe6;
    border-left: 3px solid #24a148;
  }

  .notification-title {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 600;
    font-size: 14px;
    line-height: 18px;
    letter-spacing: 0.16px;
    color: #161616;
    margin-bottom: 8px;
  }

  .notification-message {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 400;
    font-size: 14px;
    line-height: 18px;
    letter-spacing: 0.16px;
    color: #161616;
    margin-bottom: 16px;
  }
</style>
