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
  import SectionHeaderWithIcon from '../components/section-header-with-icon.svelte';

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
  <SectionHeaderWithIcon title={m.section_join_assisted()} icon={MagicWand} />

  <div class="join-stats-accordion">
    <Accordion>
      <AccordionItem
        open={joinedExpanded}
        on:click={() => (joinedExpanded = !joinedExpanded)}
      >
        <svelte:fragment slot="title">
          <div class="accordion-title">
            <CheckmarkFilled size={20} class="icon-success" />
            <span>{m.join_entities_joined({ count: joinedCount })}</span>
          </div>
        </svelte:fragment>
        <p class="helper-text">
          {m.join_entities_joined_desc()}
        </p>
      </AccordionItem>

      <AccordionItem
        open={toVerifyExpanded}
        on:click={() => (toVerifyExpanded = !toVerifyExpanded)}
      >
        <svelte:fragment slot="title">
          <div class="accordion-title">
            <WarningFilled size={20} class="icon-warning" />
            <span>{m.join_entities_to_verify({ count: toVerifyCount })}</span>
          </div>
        </svelte:fragment>
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
          {#each joinRows as row, i (i)}
            <div class="join-row">
              <div class="col a">{row.dataValue}</div>
              <div class="col eq">=</div>
              <div class="col b">
                <Select
                  id={`join-${i}`}
                  labelText=""
                  selected={row.selectedMapping}
                  on:change={(e) => {
                    const target = e.target as HTMLSelectElement;
                    const selectedValue = target?.value || row.selectedMapping;
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
      </AccordionItem>

      <AccordionItem
        open={duplicatesExpanded}
        on:click={() => (duplicatesExpanded = !duplicatesExpanded)}
      >
        <svelte:fragment slot="title">
          <div class="accordion-title">
            <WarningAltFilled size={20} class="icon-error" />
            <span>{m.join_entities_duplicate({ count: duplicateCount })}</span>
          </div>
        </svelte:fragment>
        {#if duplicateCount > 0}
          <ul class="issues-list">
            {#each duplicates as d, idx (idx)}
              <li>{d}</li>
            {/each}
          </ul>
        {/if}
      </AccordionItem>

      <AccordionItem
        open={unrecognizedExpanded}
        on:click={() => (unrecognizedExpanded = !unrecognizedExpanded)}
      >
        <svelte:fragment slot="title">
          <div class="accordion-title">
            <ErrorFilled size={20} class="icon-error" />
            <span
              >{m.join_entities_unrecognized({
                count: unrecognizedCount
              })}</span
            >
          </div>
        </svelte:fragment>
        {#if unrecognizedCount > 0}
          <ul class="issues-list">
            {#each unknowns as u, idx (idx)}
              <li>{u}</li>
            {/each}
          </ul>
        {/if}
      </AccordionItem>
    </Accordion>
  </div>

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
    <div class="correction">
      <div class="title">{m.join_correction_title()}</div>
      <p>
        {m.join_correction_desc()}
      </p>
      <Button kind="secondary" size="small" on:click={onApplyCorrections}
        >{m.join_correction_button()}</Button
      >
    </div>
  {:else if joinedCount > 0}
    <div class="validation">
      <div class="title">{m.join_validation_title()}</div>
      <p>
        {m.join_validation_desc()}
      </p>
      <Button kind="primary" size="small" on:click={onFinalizeJoin}
        >{m.join_validation_button()}</Button
      >
    </div>
  {/if}
</div>

<style>
  .join-assisted-section {
    margin-top: var(--cds-spacing-06);
    padding-top: var(--cds-spacing-06);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .join-stats-accordion {
    margin-bottom: var(--cds-spacing-05);
  }

  .join-stats-accordion :global(.bx--accordion) {
    border: 1px solid var(--cds-border-subtle);
    border-radius: var(--cds-spacing-02);
    overflow: hidden;
  }

  .join-stats-accordion :global(.bx--accordion__item) {
    border-top: 1px solid var(--cds-border-subtle);
  }

  .join-stats-accordion :global(.bx--accordion__item:first-child) {
    border-top: none;
  }

  .accordion-title {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .accordion-title :global(.icon-success) {
    color: var(--cds-support-success);
  }

  .accordion-title :global(.icon-warning) {
    color: var(--cds-support-warning);
  }

  .accordion-title :global(.icon-error) {
    color: var(--cds-support-error);
  }

  .join-table {
    border: none;
    border-radius: 0;
    margin-bottom: 0;
    overflow: hidden;
  }

  .join-table .head {
    display: grid;
    grid-template-columns: 1fr 1fr;
    background-color: var(--cds-highlight);
    color: var(--cds-text-01);
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    font-weight: 600;
    border-bottom: 1px solid var(--cds-border-subtle);
  }

  .join-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    background-color: var(--cds-layer-01);
    border-bottom: 1px solid var(--cds-border-subtle);
    align-items: center;
  }

  .join-row:last-child {
    border-bottom: none;
  }

  .issues-list {
    margin: 0;
    padding-left: 1.2rem;
  }

  .correction {
    border-left: 4px solid var(--cds-focus);
    background: var(--cds-layer);
    padding: var(--cds-spacing-04);
    margin-top: var(--cds-spacing-05);
    border-radius: var(--cds-spacing-02);
  }

  .correction .title {
    font-weight: 700;
    margin-bottom: var(--cds-spacing-03);
  }

  .validation {
    border-left: 4px solid var(--cds-support-success);
    background: var(--cds-layer);
    padding: var(--cds-spacing-04);
    margin-top: var(--cds-spacing-05);
    border-radius: var(--cds-spacing-02);
  }

  .validation .title {
    font-weight: 700;
    margin-bottom: var(--cds-spacing-03);
    color: var(--cds-support-success);
  }

  .validation p {
    margin-bottom: var(--cds-spacing-04);
  }

  .helper-text {
    color: var(--cds-text-secondary);
    font-size: 0.875rem;
    margin: 0;
  }
</style>
