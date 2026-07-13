<script lang="ts">
  import VariableBadge from '$lib/features/commons/components/variable-badge.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    ComboBox,
    InlineNotification,
    Select,
    SelectItem,
    fuzzyMatch,
    highlightSegments
  } from 'carbon-components-svelte';
  import {
    CheckmarkFilled,
    ChevronDown,
    ChevronUp,
    ErrorFilled,
    MagicWand,
    Misuse,
    Renew,
    WarningAltFilled,
    WarningFilled
  } from 'carbon-icons-svelte';
  import { InfoPopover } from '$lib/features/commons/components/viz-controls';
  import type { BasemapAlias } from '$lib/features/duckdb/orchestrator/join-ops';
  import type { JoinCandidate } from '$lib/features/commons/types/data-tab.types';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';

  type IgnoreSource = 'joined' | 'to_verify' | 'unrecognized';

  interface JoinRow {
    dataValue: string;
    selectedMapping: string;
    basemapOptions: string[];
    candidates?: JoinCandidate[];
  }

  interface ComboBoxItem {
    id: string;
    text: string;
    foldedText: string;
    searchAliases: Array<{ value: string; folded: string }>;
    disabled?: boolean;
    separator?: boolean;
  }

  const SUGGESTIONS_SEPARATOR_ITEM: ComboBoxItem = {
    id: '__join_suggestions_separator__',
    text: '',
    foldedText: '',
    searchAliases: [],
    disabled: true,
    separator: true
  };

  interface HighlightSegment {
    text: string;
    match: boolean;
  }

  interface ComboItemDisplay {
    textSegments: HighlightSegment[];
    aliasSegments: HighlightSegment[] | null;
  }

  interface JoinedEntityRow {
    dataValue: string;
    basemapValue: string;
    otherIdentifiers?: string[];
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
    basemapAliasesByValue?: Record<string, BasemapAlias[]>;
    onRequestBasemapValues?: () => void;
    onFinalizeJoin: () => void;
    onManualCorrection?: (dataValue: string, basemapValue: string) => void;
    onMappingChange?: (index: number, basemapValue: string) => void;
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
    basemapAliasesByValue = {},
    onRequestBasemapValues,
    onFinalizeJoin,
    onManualCorrection,
    onMappingChange,
    onIgnoreEntity,
    onRestoreEntity,
    onValidateEntity
  }: Props = $props();

  const joinedBasemapValueSet = $derived.by(() => {
    const set = new SvelteSet<string>();
    for (const row of joinedEntitiesList) {
      if (!row.basemapValue) continue;
      set.add(row.basemapValue);
      const aliases = basemapAliasesByValue?.[row.basemapValue];
      if (!aliases) continue;
      for (const alias of aliases) {
        if (alias.value) set.add(alias.value);
      }
    }
    return set;
  });

  const basemapValueSet = $derived.by(() => {
    const set = new SvelteSet<string>();
    for (const value of basemapValues) set.add(value);
    return set;
  });

  const availableBasemapValues = $derived.by(() => {
    const seen = new SvelteSet<string>();
    const values: string[] = [];
    for (const value of basemapValues) {
      if (joinedBasemapValueSet.has(value) || seen.has(value)) continue;
      seen.add(value);
      values.push(value);
    }
    return values;
  });

  const basemapComboBoxItems = $derived<ComboBoxItem[]>(
    availableBasemapValues.map((value) => buildBasemapComboBoxItem(value))
  );

  const joinedValueSignature = $derived(
    Array.from(joinedBasemapValueSet).sort().join('')
  );

  function foldForSearch(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function buildBasemapComboBoxItem(value: string): ComboBoxItem {
    const aliases = basemapAliasesByValue?.[value] ?? [];
    const seenAliases = new SvelteSet<string>([value]);
    const searchAliases: ComboBoxItem['searchAliases'] = [];
    for (const alias of aliases) {
      if (!alias.value || seenAliases.has(alias.value)) continue;
      seenAliases.add(alias.value);
      searchAliases.push({
        value: alias.value,
        folded: foldForSearch(alias.value)
      });
    }
    return {
      id: value,
      text: value,
      foldedText: foldForSearch(value),
      searchAliases
    };
  }

  const COMBO_FUZZY_OPTIONS = { threshold: 0.3 };

  function shouldFilterBasemapItem(item: ComboBoxItem, value: string): boolean {
    const query = foldForSearch(value.trim());
    if (item.separator) return !query;
    if (!query) return true;
    if (fuzzyMatch(item.foldedText, query, COMBO_FUZZY_OPTIONS).matched) {
      return true;
    }
    return item.searchAliases.some(
      (alias) => fuzzyMatch(alias.folded, query, COMBO_FUZZY_OPTIONS).matched
    );
  }

  let activeComboQuery = $state<{ key: string; query: string } | null>(null);

  function setActiveComboQuery(key: string, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    activeComboQuery = { key, query: target?.value ?? '' };
  }

  function getActiveComboQuery(key: string): string {
    return activeComboQuery?.key === key ? activeComboQuery.query.trim() : '';
  }

  function buildComboItemDisplay(
    item: ComboBoxItem,
    rawQuery: string
  ): ComboItemDisplay {
    const plainText: HighlightSegment[] = [{ text: item.text, match: false }];
    const query = foldForSearch(rawQuery);
    if (!query) return { textSegments: plainText, aliasSegments: null };

    const textMatch = fuzzyMatch(item.foldedText, query, COMBO_FUZZY_OPTIONS);
    if (textMatch.matched && textMatch.indices.length > 0) {
      return {
        textSegments: highlightSegments(item.text, textMatch.indices),
        aliasSegments: null
      };
    }

    for (const alias of item.searchAliases) {
      const aliasMatch = fuzzyMatch(alias.folded, query, COMBO_FUZZY_OPTIONS);
      if (aliasMatch.matched && aliasMatch.indices.length > 0) {
        return {
          textSegments: plainText,
          aliasSegments: highlightSegments(alias.value, aliasMatch.indices)
        };
      }
    }

    return { textSegments: plainText, aliasSegments: null };
  }

  function buildJoinedRowOptions(currentBasemapValue: string): ComboBoxItem[] {
    const ownVariants = new SvelteSet<string>();
    ownVariants.add(currentBasemapValue);
    const aliases = basemapAliasesByValue?.[currentBasemapValue];
    if (aliases) {
      for (const alias of aliases) {
        if (alias.value) ownVariants.add(alias.value);
      }
    }
    const seen = new SvelteSet<string>();
    const items: ComboBoxItem[] = [];
    for (const value of basemapValues) {
      if (seen.has(value)) continue;
      if (!ownVariants.has(value) && joinedBasemapValueSet.has(value)) continue;
      seen.add(value);
      items.push(buildBasemapComboBoxItem(value));
    }
    return items;
  }

  function resolveDisplayedBasemapValue(value: string): string {
    if (basemapValueSet.has(value)) return value;
    const aliases = basemapAliasesByValue?.[value];
    const displayedAlias = aliases?.find((alias) =>
      basemapValueSet.has(alias.value)
    );
    return displayedAlias?.value ?? value;
  }

  const duplicateCount = $derived(duplicates.length);
  const unrecognizedCount = $derived(unknowns.length);
  const ignoredCount = $derived(ignoredEntities.length);

  const deduplicatedJoinRows = $derived(
    joinRows.map((row) => {
      const seen: string[] = [];
      const dedupedOptions = row.basemapOptions.filter((option) => {
        if (seen.includes(option)) return false;
        seen.push(option);
        return true;
      });
      return { ...row, basemapOptions: dedupedOptions };
    })
  );

  let toVerifySelectedMappings = $state<Record<string, string>>({});

  function getToVerifyRowKey(index: number): string {
    return `verify-${index}`;
  }

  function getToVerifySelectedMapping(
    rowKey: string,
    fallback: string
  ): string {
    return toVerifySelectedMappings[rowKey] ?? fallback;
  }

  function normalizeSelectedValue(
    value: string | number | undefined,
    fallback: string
  ): string {
    if (value === undefined || value === '') return fallback;
    return String(value);
  }

  function handleToVerifyMappingChange(
    rowKey: string,
    index: number,
    fallback: string,
    value: string | number | undefined
  ): void {
    activeComboQuery = null;
    const selectedValue = normalizeSelectedValue(value, fallback);
    toVerifySelectedMappings[rowKey] = selectedValue;
    onMappingChange?.(index, selectedValue);
  }

  $effect(() => {
    const nextSelections: Record<string, string> = {};
    deduplicatedJoinRows.forEach((row, index) => {
      nextSelections[getToVerifyRowKey(index)] = row.selectedMapping;
    });
    toVerifySelectedMappings = nextSelections;
  });

  interface RowVirtualizer {
    visibleRows: SvelteSet<string>;
    pendingRows: Map<Element, string>;
    observer: IntersectionObserver | undefined;
  }

  function createRowVirtualizer(): RowVirtualizer {
    return {
      visibleRows: new SvelteSet<string>(),
      pendingRows: new Map<Element, string>(),
      observer: undefined
    };
  }

  function attachVirtualizer(
    virt: RowVirtualizer,
    root: HTMLElement | undefined
  ): (() => void) | void {
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = virt.pendingRows.get(entry.target);
          if (id) virt.visibleRows.add(id);
        }
      },
      { root, rootMargin: '200px 0px' }
    );
    virt.observer = observer;
    for (const node of virt.pendingRows.keys()) {
      observer.observe(node);
    }
    return () => {
      observer.disconnect();
      if (virt.observer === observer) {
        virt.observer = undefined;
      }
    };
  }

  function makeObserveAction(virt: RowVirtualizer) {
    return (node: HTMLElement, id: string) => {
      virt.pendingRows.set(node, id);
      virt.observer?.observe(node);
      return {
        destroy() {
          virt.observer?.unobserve(node);
          virt.pendingRows.delete(node);
        }
      };
    };
  }

  let joinedScrollEl = $state<HTMLDivElement | undefined>(undefined);
  let toVerifyScrollEl = $state<HTMLDivElement | undefined>(undefined);
  let unrecognizedScrollEl = $state<HTMLDivElement | undefined>(undefined);

  const joinedVirt = createRowVirtualizer();
  const toVerifyVirt = createRowVirtualizer();
  const unrecognizedVirt = createRowVirtualizer();

  const visibleJoinedRows = joinedVirt.visibleRows;
  const visibleToVerifyRows = toVerifyVirt.visibleRows;
  const visibleUnrecognizedRows = unrecognizedVirt.visibleRows;

  const observeRow = makeObserveAction(joinedVirt);
  const observeToVerifyRow = makeObserveAction(toVerifyVirt);
  const observeUnrecognizedRow = makeObserveAction(unrecognizedVirt);

  $effect(() => attachVirtualizer(joinedVirt, joinedScrollEl));
  $effect(() => attachVirtualizer(toVerifyVirt, toVerifyScrollEl));
  $effect(() => attachVirtualizer(unrecognizedVirt, unrecognizedScrollEl));

  const pendingUnrecognizedSelections = new SvelteMap<string, string>();

  function handleUnrecognizedSelect(
    entity: string,
    item: ComboBoxItem | undefined
  ): void {
    activeComboQuery = null;
    if (item) {
      pendingUnrecognizedSelections.set(entity, item.text);
    } else {
      pendingUnrecognizedSelections.delete(entity);
    }
  }

  function handleUnrecognizedValidate(entity: string): void {
    const value = pendingUnrecognizedSelections.get(entity);
    if (!value) return;
    pendingUnrecognizedSelections.delete(entity);
    onManualCorrection?.(entity, value);
    announce(m.join_announce_validated({ entity }));
  }

  function buildToVerifyItems(suggestions: string[]): ComboBoxItem[] {
    const suggestedValues = new SvelteSet<string>();
    const suggestedItems: ComboBoxItem[] = [];
    for (const suggestion of suggestions) {
      const displayedSuggestion = resolveDisplayedBasemapValue(suggestion);
      if (
        !joinedBasemapValueSet.has(displayedSuggestion) &&
        !suggestedValues.has(displayedSuggestion)
      ) {
        suggestedValues.add(displayedSuggestion);
        suggestedItems.push(buildBasemapComboBoxItem(displayedSuggestion));
      }
    }
    if (suggestedItems.length === 0) {
      return basemapComboBoxItems;
    }
    const remainingItems = basemapComboBoxItems.filter(
      (item) => !suggestedValues.has(item.id)
    );
    if (remainingItems.length === 0) {
      return suggestedItems;
    }
    return [...suggestedItems, SUGGESTIONS_SEPARATOR_ITEM, ...remainingItems];
  }

  interface RowTooltip {
    tags: string[];
    text: string;
    disabled: boolean;
  }

  function formatAliasTag(value: string, variant: string | null): string {
    if (!variant || variant.length === 0) return value;
    return `${variant} : ${value}`;
  }

  function buildRowTooltip(
    selectedBasemapValue: string | undefined,
    extraIdentifiers: string[] | undefined = undefined
  ): RowTooltip {
    if (!selectedBasemapValue) {
      return { tags: [], text: '', disabled: true };
    }
    const seenValues = new SvelteSet<string>();
    const tags: string[] = [];
    const push = (value: string, variant: string | null) => {
      const trimmed = value?.trim();
      if (!trimmed || seenValues.has(trimmed)) return;
      seenValues.add(trimmed);
      tags.push(formatAliasTag(trimmed, variant));
    };

    const aliases = basemapAliasesByValue?.[selectedBasemapValue];
    const sourceVariant =
      aliases?.find((a) => a.value === selectedBasemapValue)?.variant ?? null;
    push(selectedBasemapValue, sourceVariant);

    if (aliases) {
      for (const alias of aliases) {
        if (alias.value !== selectedBasemapValue) {
          push(alias.value, alias.variant);
        }
      }
    }

    if (extraIdentifiers) {
      for (const id of extraIdentifiers) push(id, null);
    }

    return { tags, text: '', disabled: false };
  }

  function getSelectedCandidate(
    row: JoinRow,
    selectedMapping: string
  ): JoinCandidate | undefined {
    if (!selectedMapping) return undefined;
    return row.candidates?.find(
      (c) =>
        c.name === selectedMapping ||
        resolveDisplayedBasemapValue(c.name) === selectedMapping
    );
  }

  function buildToVerifyTooltip(
    selectedMapping: string,
    candidate: JoinCandidate | undefined
  ): RowTooltip {
    const base = buildRowTooltip(selectedMapping);
    if (!candidate) return base;
    const text =
      candidate.type === 'exact'
        ? m.join_match_ambiguous_details()
        : m.join_match_fuzzy_details({
            matched: candidate.name,
            score: Math.round(candidate.score * 100)
          });
    return { ...base, text, disabled: false };
  }

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
    toVerifyExpanded = toVerifyCount > 0;
    duplicatesExpanded = false;
    unrecognizedExpanded = false;
    ignoredExpanded = false;
  }

  function toggleJoined(): void {
    const nextExpanded = !joinedExpanded;
    joinedExpanded = nextExpanded;
    if (nextExpanded && basemapValues.length === 0) {
      onRequestBasemapValues?.();
    }
  }

  $effect(() => {
    if (toVerifyExpanded && toVerifyCount > 0 && basemapValues.length === 0) {
      onRequestBasemapValues?.();
    }
  });

  function toggleUnrecognized(): void {
    const nextExpanded = !unrecognizedExpanded;
    unrecognizedExpanded = nextExpanded;
    if (nextExpanded && basemapValues.length === 0) {
      onRequestBasemapValues?.();
    }
  }

  let hasInitializedExpanded = $state(false);
  let notificationSnapshot = $state<NotificationSnapshot>({
    hasBlockingErrors: false,
    showSuccessNotification: false,
    showValidationNotification: false
  });

  const displayedNotificationState = $derived(
    loading ? notificationSnapshot : currentNotificationState
  );

  $effect(() => {
    if (!loading && !hasInitializedExpanded) {
      resetToDefaultExpanded();
      hasInitializedExpanded = true;
    }
  });

  $effect(() => {
    if (hasInitializedExpanded && !loading && toVerifyCount === 0) {
      toVerifyExpanded = false;
    }
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

  let ariaLiveMessage = $state('');
  let ariaLiveResetTimer: ReturnType<typeof setTimeout> | undefined;

  function announce(message: string): void {
    if (!message) return;
    ariaLiveMessage = '';
    if (ariaLiveResetTimer) clearTimeout(ariaLiveResetTimer);
    ariaLiveResetTimer = setTimeout(() => {
      ariaLiveMessage = message;
    }, 50);
  }

  function handleIgnore(
    dataValue: string,
    source: IgnoreSource,
    basemapValue?: string
  ): void {
    const nextIgnoredCount = ignoredCount + 1;
    onIgnoreEntity?.(dataValue, source, basemapValue);
    announce(
      nextIgnoredCount === 1
        ? m.join_announce_ignored_one({ entity: dataValue })
        : m.join_announce_ignored({
            entity: dataValue,
            count: nextIgnoredCount
          })
    );
  }

  function handleRestore(dataValue: string): void {
    onRestoreEntity?.(dataValue);
    announce(m.join_announce_restored({ entity: dataValue }));
  }

  function handleValidate(dataValue: string, basemapValue: string): void {
    if (!basemapValue) return;
    onValidateEntity?.(dataValue, basemapValue);
    announce(m.join_announce_validated({ entity: dataValue }));
  }
</script>

{#snippet comboItemContent(comboItem: ComboBoxItem, query: string)}
  {#if comboItem.separator}
    <span class="combo-separator">{m.join_combobox_all_identifiers()}</span>
  {:else}
    {@const display = buildComboItemDisplay(comboItem, query)}
    <span class="combo-item">
      <span class="combo-item-text">
        {#each display.textSegments as segment, i (i)}
          {#if segment.match}<mark class="combo-item-match">{segment.text}</mark
            >{:else}{segment.text}{/if}
        {/each}
      </span>
      {#if display.aliasSegments}
        <span class="combo-item-alias">
          ≈&nbsp;{#each display.aliasSegments as segment, i (i)}
            {#if segment.match}<mark class="combo-item-match"
                >{segment.text}</mark
              >{:else}{segment.text}{/if}
          {/each}
        </span>
      {/if}
    </span>
  {/if}
{/snippet}

<div class="join-assisted-section">
  <div
    class="visually-hidden"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    {ariaLiveMessage}
  </div>
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
          type="button"
          class="category-row-header"
          onclick={toggleJoined}
          aria-expanded={joinedExpanded}
        >
          <span class="category-icon icon-success">
            <CheckmarkFilled size={20} />
          </span>
          <div class="category-count count-success">{joinedCount}</div>
          <span class="category-label label-success"
            >{joinedCount <= 1
              ? m.join_entities_joined_one()
              : m.join_entities_joined()}</span
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
                <div class="join-table-scroll" bind:this={joinedScrollEl}>
                  {#each joinedEntitiesList as row, joinedIndex (row.dataValue)}
                    {@const joinedTooltip = buildRowTooltip(
                      row.basemapValue,
                      row.otherIdentifiers
                    )}
                    <div class="table-row" use:observeRow={row.dataValue}>
                      <div class="table-cell cell-data" title={row.dataValue}>
                        {row.dataValue}
                      </div>
                      <div class="table-cell cell-equals">=</div>
                      <div class="table-cell cell-select">
                        {#if visibleJoinedRows.has(row.dataValue)}
                          {@const joinedRowOptions = buildJoinedRowOptions(
                            row.basemapValue
                          )}
                          {#key joinedValueSignature}
                            <ComboBox
                              portalMenu
                              autoHighlight="first-match"
                              id={`join-joined-${joinedIndex}`}
                              items={joinedRowOptions}
                              selectedId={row.basemapValue}
                              placeholder={row.basemapValue}
                              labelText={m.join_select_label_joined({
                                entity: row.dataValue
                              })}
                              hideLabel
                              size="sm"
                              shouldFilterItem={shouldFilterBasemapItem}
                              on:input={(e) =>
                                setActiveComboQuery(
                                  `joined-${row.dataValue}`,
                                  e
                                )}
                              on:select={(e) => {
                                activeComboQuery = null;
                                const item = e.detail.selectedItem as
                                  ComboBoxItem | undefined;
                                const nextValue = item?.text;
                                if (
                                  nextValue &&
                                  nextValue !== row.basemapValue &&
                                  onManualCorrection
                                ) {
                                  onManualCorrection(row.dataValue, nextValue);
                                  announce(
                                    m.join_announce_remapped({
                                      entity: row.dataValue
                                    })
                                  );
                                }
                              }}
                              let:item
                            >
                              {@render comboItemContent(
                                item as ComboBoxItem,
                                getActiveComboQuery(`joined-${row.dataValue}`)
                              )}
                            </ComboBox>
                          {/key}
                        {:else}
                          <div class="select-placeholder" aria-hidden="true">
                            {row.basemapValue}
                          </div>
                        {/if}
                      </div>
                      <div class="row-actions">
                        <span class="row-action row-action-info">
                          <InfoPopover
                            text={joinedTooltip.text}
                            tags={joinedTooltip.tags}
                            disabled={joinedTooltip.disabled}
                          />
                        </span>
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
                        <button
                          type="button"
                          class="row-action row-action-validate row-action-disabled"
                          aria-label={m.join_action_validated()}
                          title={m.join_action_validated()}
                          disabled
                        >
                          <CheckmarkFilled size={20} />
                        </button>
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
          type="button"
          class="category-row-header"
          onclick={() => (toVerifyExpanded = !toVerifyExpanded)}
          aria-expanded={toVerifyExpanded}
        >
          <span class="category-icon icon-warning">
            <WarningFilled size={20} />
          </span>
          <div class="category-count count-warning">{toVerifyCount}</div>
          <span class="category-label label-warning"
            >{toVerifyCount <= 1
              ? m.join_entities_to_verify_one()
              : m.join_entities_to_verify()}</span
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
              <div class="join-table-scroll" bind:this={toVerifyScrollEl}>
                {#each deduplicatedJoinRows as row, i (i)}
                  {@const rowKey = getToVerifyRowKey(i)}
                  {@const selectedMapping = getToVerifySelectedMapping(
                    rowKey,
                    row.selectedMapping
                  )}
                  {@const selectedCandidate = getSelectedCandidate(
                    row,
                    selectedMapping
                  )}
                  {@const matchScorePercent =
                    selectedCandidate && selectedCandidate.score < 1
                      ? Math.round(selectedCandidate.score * 100)
                      : null}
                  {@const verifyTooltip = buildToVerifyTooltip(
                    selectedMapping,
                    selectedCandidate
                  )}
                  <div class="table-row" use:observeToVerifyRow={rowKey}>
                    <div class="table-cell cell-data">{row.dataValue}</div>
                    <div
                      class="table-cell cell-equals cell-equals-approx"
                      aria-label={matchScorePercent !== null
                        ? m.join_match_score_label({
                            score: matchScorePercent
                          })
                        : m.join_approximate_indicator()}
                    >
                      <span class="approx-symbol" aria-hidden="true">≈</span>
                      {#if matchScorePercent !== null}
                        <span class="match-score" aria-hidden="true"
                          >{matchScorePercent}&nbsp;%</span
                        >
                      {/if}
                    </div>
                    <div class="table-cell cell-select">
                      {#if visibleToVerifyRows.has(rowKey)}
                        {@const toVerifyItems = buildToVerifyItems(
                          row.basemapOptions
                        )}
                        {#key basemapComboBoxItems}
                          <ComboBox
                            portalMenu
                            autoHighlight="first-match"
                            id={`join-${i}`}
                            items={toVerifyItems}
                            selectedId={resolveDisplayedBasemapValue(
                              selectedMapping
                            )}
                            labelText={m.join_select_label_to_verify({
                              entity: row.dataValue
                            })}
                            hideLabel
                            size="sm"
                            shouldFilterItem={(item, value) =>
                              value ===
                                resolveDisplayedBasemapValue(selectedMapping) ||
                              shouldFilterBasemapItem(item, value)}
                            on:input={(e) => setActiveComboQuery(rowKey, e)}
                            on:select={(e) =>
                              handleToVerifyMappingChange(
                                rowKey,
                                i,
                                row.selectedMapping,
                                (
                                  e.detail.selectedItem as
                                    ComboBoxItem | undefined
                                )?.id
                              )}
                            on:clear={() =>
                              handleToVerifyMappingChange(
                                rowKey,
                                i,
                                row.selectedMapping,
                                undefined
                              )}
                            let:item
                          >
                            {@render comboItemContent(
                              item as ComboBoxItem,
                              getActiveComboQuery(rowKey)
                            )}
                          </ComboBox>
                        {/key}
                      {:else}
                        <div class="select-placeholder" aria-hidden="true">
                          {row.selectedMapping ?? ''}
                        </div>
                      {/if}
                    </div>
                    <div class="row-actions">
                      <span class="row-action row-action-info">
                        <InfoPopover
                          text={verifyTooltip.text}
                          tags={verifyTooltip.tags}
                          disabled={verifyTooltip.disabled}
                        />
                      </span>
                      <button
                        type="button"
                        class="row-action"
                        aria-label={m.join_action_ignore()}
                        onclick={() =>
                          handleIgnore(
                            row.dataValue,
                            'to_verify',
                            selectedMapping
                          )}
                      >
                        <Misuse size={20} />
                      </button>
                      <button
                        type="button"
                        class="row-action row-action-validate"
                        aria-label={m.join_action_validate()}
                        disabled={!selectedMapping}
                        onclick={() =>
                          handleValidate(row.dataValue, selectedMapping)}
                      >
                        <CheckmarkFilled size={20} />
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>

      <div class="category-row category-row-unrecognized">
        <button
          type="button"
          class="category-row-header"
          onclick={toggleUnrecognized}
          aria-expanded={unrecognizedExpanded}
        >
          <span class="category-icon icon-error">
            <ErrorFilled size={20} />
          </span>
          <div class="category-count count-error">{unrecognizedCount}</div>
          <span class="category-label label-error"
            >{unrecognizedCount <= 1
              ? m.join_entities_unrecognized_one()
              : m.join_entities_unrecognized()}</span
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
              <div class="join-table-scroll" bind:this={unrecognizedScrollEl}>
                {#each unknowns as entity, unknownIndex (entity)}
                  {@const hasPendingSelection =
                    pendingUnrecognizedSelections.has(entity)}
                  {@const unrecognizedTooltip = buildRowTooltip(
                    pendingUnrecognizedSelections.get(entity)
                  )}
                  <div class="table-row" use:observeUnrecognizedRow={entity}>
                    <div class="table-cell cell-data">{entity}</div>
                    <div class="table-cell cell-equals">=</div>
                    <div class="table-cell cell-select">
                      {#if visibleUnrecognizedRows.has(entity)}
                        {#if basemapComboBoxItems.length > 0 && onManualCorrection}
                          {#key basemapComboBoxItems}
                            <ComboBox
                              portalMenu
                              autoHighlight="first-match"
                              id={`join-unrecognized-${unknownIndex}`}
                              items={basemapComboBoxItems}
                              placeholder={m.join_unrecognized_correction_placeholder()}
                              labelText={m.join_select_label_unrecognized({
                                entity
                              })}
                              hideLabel
                              size="sm"
                              shouldFilterItem={shouldFilterBasemapItem}
                              on:input={(e) =>
                                setActiveComboQuery(
                                  `unrecognized-${entity}`,
                                  e
                                )}
                              on:select={(e) =>
                                handleUnrecognizedSelect(
                                  entity,
                                  e.detail.selectedItem as
                                    ComboBoxItem | undefined
                                )}
                              let:item
                            >
                              {@render comboItemContent(
                                item as ComboBoxItem,
                                getActiveComboQuery(`unrecognized-${entity}`)
                              )}
                            </ComboBox>
                          {/key}
                        {:else}
                          <Select
                            id={`unrecognized-${entity}`}
                            labelText={m.join_select_label_unrecognized({
                              entity
                            })}
                            hideLabel
                            size="sm"
                            disabled
                          >
                            <SelectItem
                              value=""
                              text={m.join_unrecognized_correction_placeholder()}
                            />
                          </Select>
                        {/if}
                      {:else}
                        <div
                          class="select-placeholder"
                          aria-hidden="true"
                        ></div>
                      {/if}
                    </div>
                    <div class="row-actions">
                      <span class="row-action row-action-info">
                        <InfoPopover
                          text={unrecognizedTooltip.text}
                          tags={unrecognizedTooltip.tags}
                          disabled={unrecognizedTooltip.disabled}
                        />
                      </span>
                      <button
                        type="button"
                        class="row-action"
                        aria-label={m.join_action_ignore()}
                        onclick={() => handleIgnore(entity, 'unrecognized')}
                      >
                        <Misuse size={20} />
                      </button>
                      <button
                        type="button"
                        class="row-action row-action-validate"
                        class:row-action-disabled={!hasPendingSelection}
                        aria-label={m.join_action_validate()}
                        title={hasPendingSelection
                          ? m.join_action_validate()
                          : m.join_action_validate_disabled()}
                        disabled={!hasPendingSelection}
                        onclick={() => handleUnrecognizedValidate(entity)}
                      >
                        <CheckmarkFilled size={20} />
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>

      {#if duplicateCount > 0}
        <div class="category-row category-row-duplicates">
          <button
            type="button"
            class="category-row-header"
            onclick={() => (duplicatesExpanded = !duplicatesExpanded)}
            aria-expanded={duplicatesExpanded}
          >
            <span class="category-icon icon-warning-alt">
              <WarningAltFilled size={20} />
            </span>
            <div class="category-count count-warning-alt">{duplicateCount}</div>
            <span class="category-label label-warning-alt"
              >{duplicateCount <= 1
                ? m.join_entities_duplicate_one()
                : m.join_entities_duplicate()}</span
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
            type="button"
            class="category-row-header"
            onclick={() => (ignoredExpanded = !ignoredExpanded)}
            aria-expanded={ignoredExpanded}
          >
            <span class="category-icon icon-ignored">
              <Misuse size={20} />
            </span>
            <div class="category-count count-ignored">{ignoredCount}</div>
            <span class="category-label label-ignored"
              >{ignoredCount <= 1
                ? m.join_entities_ignored_one()
                : m.join_entities_ignored()}</span
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

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 16px 16px 16px;
  }

  .section-header-icon {
    display: flex;
    align-items: center;
    color: var(--cds-text-secondary, #525252);
  }

  .section-title {
    font-size: 0.875rem;
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

  .category-row-header:focus-visible {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: -2px;
  }

  .category-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .icon-success :global(svg) {
    fill: #24a148;
  }

  .icon-warning :global(svg) {
    fill: #f1c21b;
  }

  .icon-warning-alt :global(svg) {
    fill: #da1e28;
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
    justify-content: center;
    min-width: 4ch;
    padding: 0 8px 2px 8px;
    font-weight: 600;
    font-size: 1rem;
    line-height: 22px;
    color: #161616;
    border-bottom: 1px solid;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .count-success {
    background-color: #defbe6;
    border-bottom-color: #24a148;
  }

  .count-warning {
    background-color: #fcf4d6;
    border-bottom-color: #f1c21b;
  }

  .count-warning-alt,
  .count-error {
    background-color: #fff1f1;
    border-bottom-color: #da1e28;
  }

  .count-ignored {
    background-color: var(--cds-layer-01, #f4f4f4);
    border-bottom-color: var(--cds-border-strong-01, #8d8d8d);
  }

  .category-label {
    flex: 1;
    font-weight: 400;
    font-size: 0.875rem;
    line-height: 22px;
    color: #00539a;
  }

  .label-success,
  .label-warning,
  .label-warning-alt,
  .label-error,
  .label-ignored {
    color: #00539a;
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
  }

  .join-table-scroll {
    display: flex;
    flex-direction: column;
    max-height: 480px;
    overflow-y: auto;
  }

  .join-table-success .table-header {
    background-color: #defbe6;
    border-bottom: 1px solid rgba(36, 161, 72, 0.3);
  }
  .join-table-warning .table-header {
    background-color: #fcf4d6;
    border-bottom: 1px solid rgba(241, 194, 27, 0.3);
  }
  .join-table-error .table-header {
    background-color: #fff1f1;
    border-bottom: 1px solid rgba(218, 30, 40, 0.3);
  }
  .join-table-info .table-header {
    background-color: #edf5ff;
    border-bottom: 1px solid rgba(0, 67, 206, 0.3);
  }

  .join-table .table-row {
    background-color: #f4f4f4;
    border-bottom: 1px solid #c6c6c6;
  }
  .join-table .table-row:last-child {
    border-bottom: none;
  }

  .table-header {
    display: flex;
    align-items: stretch;
    gap: 0;
    min-height: 40px;
  }

  .table-header-left,
  .table-header-right {
    padding: 8px;
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
    font-size: 14px;
    line-height: 20px;
    letter-spacing: 0.16px;
    color: #161616;
  }

  .table-row {
    display: flex;
    align-items: center;
    padding: 8px;
    min-height: 48px;
    gap: 8px;
    box-sizing: border-box;
  }

  .table-row-lines {
    min-height: 40px;
  }

  .table-cell {
    font-weight: 400;
    font-size: 14px;
    line-height: 18px;
    letter-spacing: 0.16px;
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
    font-size: 1rem;
    line-height: 1;
    color: var(--cds-text-secondary, #525252);
    width: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .join-table-success .cell-equals {
    color: #24a148;
  }
  .join-table-warning .cell-equals {
    color: #f1c21b;
  }
  .join-table-error .cell-equals {
    color: #da1e28;
  }

  .cell-equals-approx {
    color: #f1c21b;
    flex-direction: column;
    width: auto;
    min-width: 24px;
    gap: 1px;
  }

  .match-score {
    font-size: 0.625rem;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.02em;
    color: var(--cds-text-secondary, #525252);
    white-space: nowrap;
  }

  .combo-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .combo-item-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .combo-item-alias {
    font-size: 0.75rem;
    color: var(--cds-text-secondary, #525252);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .combo-item :global(mark.combo-item-match) {
    background: none;
    color: inherit;
    font-weight: 700;
  }

  .combo-separator {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--cds-text-secondary, #525252);
  }

  .combo-separator::after {
    content: '';
    flex: 1;
    border-top: 1px solid #d1d1d1;
  }

  :global([data-floating-portal] [id^='menu-join-'].bx--list-box__menu) {
    min-width: 100%;
    width: max-content;
    max-width: 26rem;
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

  .select-placeholder {
    height: 32px;
    padding: 0 2rem 0 0.75rem;
    font-size: 0.875rem;
    background-color: var(--cds-field-01, #ffffff);
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
    display: flex;
    align-items: center;
    color: var(--cds-text-secondary, #525252);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    margin-left: 8px;
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

  .row-action.row-action-info {
    margin-right: 4px;
    padding-right: 8px;
    width: auto;
    min-width: 32px;
    border-right: 1px solid #e0e0e0;
    border-radius: 0;
  }

  .row-action:hover:not(.row-action-disabled) {
    background-color: rgba(0, 0, 0, 0.05);
  }

  .row-action:focus-visible {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: -2px;
  }

  .row-action-info {
    cursor: default;
  }

  .row-action-info :global(.info-btn) {
    width: 100%;
    height: 100%;
    color: var(--cds-icon-primary, #161616);
  }

  .row-action-info :global(.info-btn svg) {
    width: 20px;
    height: 20px;
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
