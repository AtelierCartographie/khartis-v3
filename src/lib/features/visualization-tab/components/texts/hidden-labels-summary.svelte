<script lang="ts">
  import { Button, Search } from 'carbon-components-svelte';

  import { ToggleWithLabel } from '$lib/features/commons/components/viz-controls';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/stores/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import {
    formatValue,
    isSingularCount
  } from '$lib/features/commons/utils/format.utils';
  import { hiddenLabelsStore, type HiddenLabel } from '$lib/features/map';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    vizId: string;
  }

  // A list of thousands of rows of Carbon buttons freezes the panel.
  const LIST_LIMIT = 50;
  const BY_NAMES_LIMIT = 3;

  const { vizId }: Props = $props();

  let listOpen = $state(false);
  let query = $state('');

  const report = $derived(hiddenLabelsStore.getReport(vizId));
  const hidden = $derived(report?.hidden ?? []);
  const normalize = (text: string): string =>
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const matches = $derived.by(() => {
    const needle = normalize(query.trim());
    return hidden
      .filter((label) => !needle || normalize(label.text).includes(needle))
      .sort((a, b) => a.text.localeCompare(b.text));
  });

  function describeReason(label: HiddenLabel): string {
    switch (label.reason) {
      case 'labels':
        return label.by.length > 0
          ? m.hidden_labels_reason_labels({
              names: label.by.slice(0, BY_NAMES_LIMIT).join(', ')
            })
          : m.hidden_labels_reason_crowded();
      case 'bounds':
        return m.hidden_labels_reason_bounds();
      default:
        return m.hidden_labels_reason_obstacles();
    }
  }

  function placeInStyling(): void {
    hiddenLabelsStore.setRevealAll(true);
    globalActions.setNavigationState(ToolbarStep.Styling);
  }

  function handleQueryInput(event: CustomEvent | Event): void {
    const target = event.target as HTMLInputElement | null;
    query = target?.value ?? '';
  }
</script>

{#if report}
  <div class="hidden-labels" aria-live="polite">
    <p class="hidden-labels__summary">
      {#if hidden.length === 0}
        {m.hidden_labels_none()}
      {:else}
        {(isSingularCount(hidden.length)
          ? m.hidden_labels_summary_one
          : m.hidden_labels_summary)({
          hidden: formatValue(hidden.length),
          total: formatValue(report.labelCount)
        })}
      {/if}
    </p>
    {#if report.overlapping > 0}
      <p class="hidden-labels__summary">
        {(isSingularCount(report.overlapping)
          ? m.hidden_labels_overlapping_one
          : m.hidden_labels_overlapping)({
          count: formatValue(report.overlapping)
        })}
      </p>
    {/if}

    {#if hidden.length > 0}
      <ToggleWithLabel
        label={m.hidden_labels_reveal()}
        toggled={hiddenLabelsStore.revealAll}
        infoText={m.hidden_labels_reveal_info()}
        ontoggle={(value: boolean) => hiddenLabelsStore.setRevealAll(value)}
      />
      <div class="hidden-labels__actions">
        {#if globalState.selectedStep !== ToolbarStep.Styling}
          <Button kind="ghost" size="small" on:click={placeInStyling}>
            {m.hidden_labels_go_styling()}
          </Button>
        {/if}
        <Button
          kind="ghost"
          size="small"
          aria-expanded={listOpen}
          on:click={() => {
            listOpen = !listOpen;
          }}
        >
          {listOpen ? m.hidden_labels_list_hide() : m.hidden_labels_list_show()}
        </Button>
      </div>

      {#if listOpen}
        <Search
          size="sm"
          value={query}
          placeholder={m.hidden_labels_search()}
          labelText={m.hidden_labels_search()}
          on:input={handleQueryInput}
          on:clear={() => {
            query = '';
          }}
        />
        {#if matches.length === 0}
          <p class="hidden-labels__note">{m.hidden_labels_no_match()}</p>
        {:else}
          <ul class="hidden-labels__list">
            {#each matches.slice(0, LIST_LIMIT) as label (label.featureKey)}
              <li class="hidden-labels__item">
                <span class="hidden-labels__text">
                  <span class="hidden-labels__name">{label.text}</span>
                  <span class="hidden-labels__reason">
                    {describeReason(label)}
                  </span>
                </span>
                <Button
                  kind="ghost"
                  size="small"
                  aria-label={m.hidden_labels_show_label({ name: label.text })}
                  on:click={() =>
                    hiddenLabelsStore.show(vizId, label.featureKey)}
                >
                  {m.hidden_labels_show()}
                </Button>
              </li>
            {/each}
          </ul>
          {#if matches.length > LIST_LIMIT}
            <p class="hidden-labels__note">
              {m.hidden_labels_more({
                count: formatValue(matches.length - LIST_LIMIT)
              })}
            </p>
          {/if}
        {/if}
      {/if}
    {/if}
  </div>
{/if}

<style>
  .hidden-labels {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .hidden-labels__summary,
  .hidden-labels__note {
    font-size: var(--cds-helper-text-01-font-size, 0.75rem);
    color: var(--cds-text-secondary);
  }

  .hidden-labels__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-02);
  }

  .hidden-labels__list {
    display: flex;
    flex-direction: column;
    max-height: 16rem;
    overflow-y: auto;
  }

  .hidden-labels__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-03);
    border-bottom: 1px solid var(--cds-border-subtle);
  }

  .hidden-labels__text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .hidden-labels__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hidden-labels__reason {
    font-size: var(--cds-helper-text-01-font-size, 0.75rem);
    color: var(--cds-text-secondary);
  }
</style>
