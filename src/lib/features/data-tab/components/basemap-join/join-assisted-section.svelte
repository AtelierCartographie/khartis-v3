<script lang="ts">
  import VariableBadge from '$lib/features/commons/components/variable-badge.svelte';
  import * as m from '$lib/paraglide/messages';
  import { translateCarbonId } from '$lib/features/commons/utils/carbon-a11y.utils';
  import {
    formatValue,
    isSingularCount
  } from '$lib/features/commons/utils/format.utils';
  import {
    Button,
    ComboBox,
    InlineLoading,
    InlineNotification,
    Pagination,
    Select,
    SelectItem
  } from 'carbon-components-svelte';
  import {
    fuzzyMatch,
    highlightSegments
  } from 'carbon-components-svelte/src/utils/fuzzyMatch.js';
  import {
    CheckmarkFilled,
    Error as NotAllowed,
    ErrorFilled,
    MagicWandFilled,
    Reset,
    WarningAltFilled,
    WarningFilled
  } from 'carbon-icons-svelte';
  import { InfoPopover } from '$lib/features/commons/components/viz-controls';
  import TooltipBubble from '$lib/features/commons/components/carbon/tooltip-bubble.svelte';
  import type { BasemapAlias } from '$lib/features/duckdb/orchestrator/join-ops';
  import type { JoinFuzzyPassEstimate } from '$lib/features/duckdb';
  import { joinControlStore, type JoinPanelCategory } from '$lib/features/map';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import JoinCategoryHeader from '$lib/features/commons/components/join-category-header.svelte';
  import type {
    EntityValidation,
    IgnoredEntity,
    JoinCandidate
  } from '$lib/features/commons/types/data-tab.types';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { untrack } from 'svelte';

  type HeaderSlot =
    | 'info'
    | null
    | {
        kind: 'ignore' | 'validate' | 'restore';
        label: string;
        onclick: () => void;
        disabled?: boolean;
      };

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
    duplicateTotal?: number;
    unrecognizedTotal?: number;
    fuzzyPassEstimate?: JoinFuzzyPassEstimate | null;
    fuzzyPassRunning?: boolean;
    onRunFullFuzzyPass?: () => void;
    linkedVariableName: string | undefined;
    basemapValues?: string[];
    loading?: boolean;
    joinFinalized?: boolean;
    joinedEntitiesList?: JoinedEntityRow[];
    joinedPage?: number;
    joinedPageSize?: number;
    joinedBasemapValues?: string[];
    onJoinedPageChange?: (page: number) => void;
    onRequestJoinedEntities?: () => void;
    duplicateLines?: LineReference[];
    ignoredEntities?: LineReference[];
    basemapAliasesByValue?: Record<string, BasemapAlias[]>;
    // Rows hold the variant each value matched, often not in the UI
    // language: they wait for the displayed values instead of switching.
    basemapValuesLoading?: boolean;
    onRequestBasemapValues?: () => void;
    onFinalizeJoin: () => void;
    onManualCorrection?: (dataValue: string, basemapValue: string) => void;
    onMappingChange?: (index: number, basemapValue: string) => void;
    onIgnoreEntities?: (entries: IgnoredEntity[]) => void;
    onRestoreEntities?: (dataValues: string[]) => void;
    onValidateEntities?: (entries: EntityValidation[]) => void;
  }

  let {
    joinRows,
    duplicates,
    unknowns,
    joinedCount,
    toVerifyCount,
    duplicateTotal,
    unrecognizedTotal,
    fuzzyPassEstimate = null,
    fuzzyPassRunning = false,
    onRunFullFuzzyPass,
    linkedVariableName,
    basemapValues = [],
    loading = false,
    joinFinalized = false,
    joinedEntitiesList = [],
    joinedPage = 1,
    joinedPageSize = 100,
    joinedBasemapValues,
    onJoinedPageChange,
    onRequestJoinedEntities,
    duplicateLines = [],
    ignoredEntities = [],
    basemapAliasesByValue = {},
    basemapValuesLoading = false,
    onRequestBasemapValues,
    onFinalizeJoin,
    onManualCorrection,
    onMappingChange,
    onIgnoreEntities,
    onRestoreEntities,
    onValidateEntities
  }: Props = $props();

  // Plain Sets are deliberate here and below: these are wholesale-replaced
  // derived values and per-call scratch, where SvelteSet would allocate one
  // signal per key and cost seconds at 35k entries (PR #245 measurements).
  // joinedBasemapValues (SQL-fed, paginated flow) wins over the row fallback
  // because joinedEntitiesList then only holds the current page.
  const joinedBasemapValueSet = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const set = new Set<string>();
    const sourceValues =
      joinedBasemapValues ?? joinedEntitiesList.map((row) => row.basemapValue);
    for (const value of sourceValues) {
      if (!value) continue;
      set.add(value);
      const aliases = basemapAliasesByValue?.[value];
      if (!aliases) continue;
      for (const alias of aliases) {
        if (alias.value) set.add(alias.value);
      }
    }
    return set;
  });

  const basemapValueSet = $derived.by(() => new Set<string>(basemapValues));

  const availableBasemapValues = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const seen = new Set<string>();
    const values: string[] = [];
    for (const value of basemapValues) {
      if (joinedBasemapValueSet.has(value) || seen.has(value)) continue;
      seen.add(value);
      values.push(value);
    }
    return values;
  });

  const availableBasemapValueSet = $derived.by(
    () => new Set<string>(availableBasemapValues)
  );

  const basemapComboBoxItems = $derived<ComboBoxItem[]>(
    availableBasemapValues.map((value) => buildBasemapComboBoxItem(value))
  );

  function haveSameValues(a: readonly string[], b: readonly string[]): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index++) {
      if (a[index] !== b[index]) return false;
    }
    return true;
  }

  function isSameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
    if (a === b) return true;
    if (a.size !== b.size) return false;
    for (const value of a) {
      if (!b.has(value)) return false;
    }
    return true;
  }

  let joinedOptionsVersion = 0;
  let lastSignatureJoinedSet: ReadonlySet<string> = new Set();
  let lastSignatureBasemapValues: readonly string[] = [];

  // ComboBox resolves selectedId only on remount when items arrive late (see
  // .claude/rules/svelte-carbon-ui.md): bump only on real option-set changes.
  const joinedValueSignature = $derived.by(() => {
    const joinedSet = joinedBasemapValueSet;
    if (
      !isSameSet(joinedSet, lastSignatureJoinedSet) ||
      !haveSameValues(basemapValues, lastSignatureBasemapValues)
    ) {
      lastSignatureJoinedSet = joinedSet;
      lastSignatureBasemapValues = basemapValues;
      joinedOptionsVersion += 1;
    }
    return joinedOptionsVersion;
  });

  function foldForSearch(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function buildBasemapComboBoxItem(value: string): ComboBoxItem {
    const aliases = basemapAliasesByValue?.[value] ?? [];
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const seenAliases = new Set<string>([value]);
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
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const ownVariants = new Set<string>();
    ownVariants.add(currentBasemapValue);
    ownVariants.add(resolveDisplayedBasemapValue(currentBasemapValue));
    const aliases = basemapAliasesByValue?.[currentBasemapValue];
    if (aliases) {
      for (const alias of aliases) {
        if (alias.value) ownVariants.add(alias.value);
      }
    }
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const seen = new Set<string>();
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

  const duplicateCount = $derived(duplicateTotal ?? duplicates.length);
  const unrecognizedCount = $derived(unrecognizedTotal ?? unknowns.length);

  const showFuzzyPassOffer = $derived(
    fuzzyPassEstimate !== null &&
      !fuzzyPassEstimate.withinBudget &&
      fuzzyPassEstimate.candidates > 0 &&
      onRunFullFuzzyPass !== undefined
  );
  const fuzzyPassSeconds = $derived(
    Math.max(1, Math.round((fuzzyPassEstimate?.estimatedMs ?? 0) / 1000))
  );
  const ignoredCount = $derived(ignoredEntities.length);
  const showJoinedPagination = $derived(
    onJoinedPageChange !== undefined && joinedCount > joinedPageSize
  );

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

  // Below this width the basemap field moves under the entity name. The
  // class, not a container query, also reaches the portalled combo menus.
  const NARROW_SECTION_WIDTH = 480;
  let sectionWidth = $state(0);
  const isNarrow = $derived(
    sectionWidth > 0 && sectionWidth <= NARROW_SECTION_WIDTH
  );
  const comboIdPrefix = $derived(isNarrow ? 'join-sm' : 'join');

  // A joined value whose entity the user cleared is no longer joined: the map
  // and the Visualize button follow it until it gets an entity or is ignored.
  const clearedJoinedRows = $derived(
    joinControlStore.getClearedValues(datasetsStore.selectedDatasetId ?? '')
  );
  function setJoinedRowCleared(dataValue: string, cleared: boolean): void {
    const datasetId = datasetsStore.selectedDatasetId;
    if (datasetId)
      joinControlStore.setJoinCleared(datasetId, dataValue, cleared);
  }

  let actionTooltipTrigger = $state<HTMLElement | null>(null);
  const actionTooltipText = $derived(
    actionTooltipTrigger?.dataset.tooltip ?? ''
  );

  // One Carbon tooltip for every row and header action, shown on hover or
  // focus of any element carrying data-tooltip.
  function actionTooltips(node: HTMLElement) {
    const show = (event: Event) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>(
        '[data-tooltip]'
      );
      if (target && node.contains(target)) actionTooltipTrigger = target;
    };
    // A focused action removed by a bulk action fires focusout while Svelte
    // tears its list down, when state cannot change: hide right after, unless
    // another action took the tooltip meanwhile.
    const hide = (event: Event) => {
      const next = (event as MouseEvent | FocusEvent).relatedTarget;
      if (next instanceof Node && actionTooltipTrigger?.contains(next)) return;
      const leaving = actionTooltipTrigger;
      queueMicrotask(() => {
        if (actionTooltipTrigger === leaving) actionTooltipTrigger = null;
      });
    };
    const close = () => {
      actionTooltipTrigger = null;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    node.addEventListener('mouseover', show);
    node.addEventListener('focusin', show);
    node.addEventListener('mouseout', hide);
    node.addEventListener('focusout', hide);
    node.addEventListener('click', close);
    node.addEventListener('keydown', closeOnEscape);
    return {
      destroy() {
        node.removeEventListener('mouseover', show);
        node.removeEventListener('focusin', show);
        node.removeEventListener('mouseout', hide);
        node.removeEventListener('focusout', hide);
        node.removeEventListener('click', close);
        node.removeEventListener('keydown', closeOnEscape);
      }
    };
  }

  // Carbon titles only the chevron's 16px SVG; the whole toggle area gets it
  // here so hovering anywhere on it names the action.
  function titleMenuToggle(node: HTMLElement) {
    const sync = () => {
      const toggle = node.querySelector<HTMLElement>(
        '.bx--list-box__menu-icon'
      );
      const label = toggle?.querySelector('title')?.textContent;
      if (toggle && label && toggle.title !== label) toggle.title = label;
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(node, {
      childList: true,
      subtree: true,
      characterData: true
    });
    return { destroy: () => observer.disconnect() };
  }

  const pendingUnrecognizedSelections = new SvelteMap<string, string>();

  // A value joined by another row since it was picked leaves the options, so
  // its combo box cannot show it: it is no longer a validatable selection.
  function getPendingUnrecognizedSelection(entity: string): string | undefined {
    const value = pendingUnrecognizedSelections.get(entity);
    return value !== undefined && availableBasemapValueSet.has(value)
      ? value
      : undefined;
  }

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
    const value = getPendingUnrecognizedSelection(entity);
    if (!value) return;
    pendingUnrecognizedSelections.delete(entity);
    onManualCorrection?.(entity, value);
    announce(m.join_announce_validated({ entity }));
  }

  function buildToVerifyItems(suggestions: string[]): ComboBoxItem[] {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const suggestedValues = new Set<string>();
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
    // Grading only keeps unclaimed candidates, so a suggestion hidden here
    // collides with a joined alias: the row still shows the match it joins on.
    if (suggestedItems.length === 0 && suggestions.length > 0) {
      const displayedSuggestion = resolveDisplayedBasemapValue(suggestions[0]);
      suggestedValues.add(displayedSuggestion);
      suggestedItems.push(buildBasemapComboBoxItem(displayedSuggestion));
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
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const seenValues = new Set<string>();
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
        : m.join_match_fuzzy_details({ matched: candidate.name });
    return { ...base, text, disabled: false };
  }

  const duplicateLinesByValue = $derived<Record<string, number[]>>(
    Object.fromEntries(duplicateLines.map((d) => [d.dataValue, d.lines]))
  );

  // One category open at a time, like every accordion of the app.
  let expandedCategory = $state<JoinPanelCategory | null>('check');
  const joinedExpanded = $derived(expandedCategory === 'matched');
  const toVerifyExpanded = $derived(expandedCategory === 'check');
  const duplicatesExpanded = $derived(expandedCategory === 'duplicate');
  const unrecognizedExpanded = $derived(expandedCategory === 'unrecognized');
  const ignoredExpanded = $derived(expandedCategory === 'ignored');
  let footerDismissed = $state(false);

  // The buckets are feedback, never a gate: on every join screen a join is
  // valid as soon as one entity is joined. To-verify entities are joined;
  // unrecognized and duplicate ones are only left out.
  const unresolvedCount = $derived(unrecognizedCount + duplicateCount);
  const hasClearedJoins = $derived(clearedJoinedRows.size > 0);
  const showSuccessNotification = $derived(
    joinedCount > 0 && joinFinalized && !hasClearedJoins
  );
  const showValidationNotification = $derived(
    joinedCount > 0 && !joinFinalized
  );
  // The validation banner already says what is left out.
  const showUnresolvedNotice = $derived(
    unresolvedCount > 0 && !footerDismissed && !showValidationNotification
  );

  interface NotificationSnapshot {
    unresolvedCount: number;
    showSuccessNotification: boolean;
    showValidationNotification: boolean;
  }

  const currentNotificationState = $derived<NotificationSnapshot>({
    unresolvedCount,
    showSuccessNotification,
    showValidationNotification
  });

  function resetToDefaultExpanded(): void {
    expandedCategory = toVerifyCount > 0 ? 'check' : null;
  }

  let sectionElement = $state<HTMLDivElement | null>(null);

  function isCategoryExpanded(category: JoinPanelCategory): boolean {
    return expandedCategory === category;
  }

  function setCategoryExpanded(
    category: JoinPanelCategory,
    expanded: boolean
  ): void {
    if (expanded) {
      expandedCategory = category;
    } else if (expandedCategory === category) {
      expandedCategory = null;
    }
    if (
      expanded &&
      (category === 'matched' || category === 'unrecognized') &&
      basemapValues.length === 0
    ) {
      onRequestBasemapValues?.();
    }
  }

  function toggleCategory(category: JoinPanelCategory): void {
    setCategoryExpanded(category, !isCategoryExpanded(category));
  }

  $effect(() => () => {
    joinControlStore.setHoverTarget(null);
  });

  // The map shows the join as the user scrolls down to it: it grows visible
  // while this section rises through the panel, then stays.
  const REVEAL_SCROLL_SPAN = 0.6;

  function findScrollParent(element: HTMLElement): HTMLElement | null {
    for (let node = element.parentElement; node; node = node.parentElement) {
      const { overflowY } = getComputedStyle(node);
      if (overflowY === 'auto' || overflowY === 'scroll') return node;
    }
    return null;
  }

  $effect(() => {
    const element = sectionElement;
    const datasetId = datasetsStore.selectedDatasetId;
    if (!element || !datasetId) return;
    const scroller = findScrollParent(element);
    if (!scroller) {
      untrack(() => joinControlStore.completeReveal(datasetId));
      return;
    }

    const update = () => {
      if (joinControlStore.getRevealProgress(datasetId) >= 1) return;
      const view = scroller.getBoundingClientRect();
      const top = element.getBoundingClientRect().top;
      const progress = (view.bottom - top) / (view.height * REVEAL_SCROLL_SPAN);
      joinControlStore.setRevealProgress(datasetId, progress);
      const isAtEnd =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      if (progress > 0 && isAtEnd) joinControlStore.completeReveal(datasetId);
    };
    untrack(update);
    scroller.addEventListener('scroll', update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', update);
      resizeObserver.disconnect();
    };
  });

  // The linked variable is chosen at the geolocation step: its badge leads
  // back to that field.
  function showLinkedVariableField(): void {
    const step = document.getElementById('geolocation-step');
    if (!step) return;
    step.scrollIntoView({ behavior: 'smooth', block: 'start' });
    step
      .querySelector<HTMLInputElement>('.geocode-field input')
      ?.focus({ preventScroll: true });
  }

  // Hovering or focusing a value outlines its territory on the map.
  function mapHoverValue(node: HTMLElement, dataValue: string) {
    let value = dataValue;
    const show = () => joinControlStore.setHoverTarget({ values: [value] });
    const hide = () => joinControlStore.setHoverTarget(null);
    node.addEventListener('pointerenter', show);
    node.addEventListener('pointerleave', hide);
    node.addEventListener('focusin', show);
    node.addEventListener('focusout', hide);
    return {
      update(nextValue: string) {
        value = nextValue;
      },
      destroy() {
        node.removeEventListener('pointerenter', show);
        node.removeEventListener('pointerleave', hide);
        node.removeEventListener('focusin', show);
        node.removeEventListener('focusout', hide);
      }
    };
  }

  $effect(() => {
    if (toVerifyExpanded && toVerifyCount > 0 && basemapValues.length === 0) {
      onRequestBasemapValues?.();
    }
  });

  // Option dedup needs the SQL-fed joined values as soon as any combo renders.
  $effect(() => {
    if (
      (joinedExpanded || toVerifyExpanded || unrecognizedExpanded) &&
      joinedCount > 0 &&
      joinedEntitiesList.length === 0
    ) {
      onRequestJoinedEntities?.();
    }
  });

  let hasInitializedExpanded = $state(false);
  let notificationSnapshot = $state<NotificationSnapshot>({
    unresolvedCount: 0,
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
    if (
      hasInitializedExpanded &&
      !loading &&
      toVerifyCount === 0 &&
      expandedCategory === 'check'
    ) {
      expandedCategory = null;
    }
  });

  $effect(() => {
    if (!loading) {
      notificationSnapshot = currentNotificationState;
    }
  });

  // A dismissed notice comes back when the unresolved set changes.
  $effect(() => {
    void unresolvedCount;
    footerDismissed = false;
  });

  let ariaLiveMessage = $state('');
  let ariaLiveResetTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    return () => {
      if (ariaLiveResetTimer) clearTimeout(ariaLiveResetTimer);
    };
  });

  function announce(message: string): void {
    if (!message) return;
    ariaLiveMessage = '';
    if (ariaLiveResetTimer) clearTimeout(ariaLiveResetTimer);
    ariaLiveResetTimer = setTimeout(() => {
      ariaLiveMessage = message;
    }, 50);
  }

  function handleIgnore(entries: IgnoredEntity[]): void {
    if (entries.length === 0) return;
    for (const entry of entries) setJoinedRowCleared(entry.dataValue, false);
    const nextIgnoredCount = ignoredCount + entries.length;
    onIgnoreEntities?.(entries);
    if (entries.length > 1) {
      announce(
        m.join_announce_ignored_many({ count: formatValue(entries.length) })
      );
      return;
    }
    const entity = entries[0].dataValue;
    announce(
      nextIgnoredCount === 1
        ? m.join_announce_ignored_one({ entity })
        : m.join_announce_ignored({
            entity,
            count: formatValue(nextIgnoredCount)
          })
    );
  }

  function handleRestore(dataValues: string[]): void {
    if (dataValues.length === 0) return;
    onRestoreEntities?.(dataValues);
    announce(
      dataValues.length === 1
        ? m.join_announce_restored({ entity: dataValues[0] })
        : m.join_announce_restored_many({
            count: formatValue(dataValues.length)
          })
    );
  }

  function handleValidate(entries: EntityValidation[]): void {
    const validEntries = entries.filter((entry) => entry.basemapValue);
    if (validEntries.length === 0) return;
    onValidateEntities?.(validEntries);
    announce(
      validEntries.length === 1
        ? m.join_announce_validated({ entity: validEntries[0].dataValue })
        : m.join_announce_validated_many({
            count: formatValue(validEntries.length)
          })
    );
  }

  const toVerifyEntries = $derived<EntityValidation[]>(
    deduplicatedJoinRows.map((row, index) => ({
      dataValue: row.dataValue,
      basemapValue: getToVerifySelectedMapping(
        getToVerifyRowKey(index),
        row.selectedMapping
      )
    }))
  );

  // The joined list is paginated in SQL, so the client never holds every
  // joined entity: no bulk action there.
  const joinedHeaderSlots: HeaderSlot[] = ['info', null, null];

  const toVerifyHeaderSlots = $derived<HeaderSlot[]>([
    'info',
    {
      kind: 'ignore',
      label: m.join_action_ignore_all(),
      onclick: () =>
        handleIgnore(
          toVerifyEntries.map((entry) => ({ ...entry, source: 'to_verify' }))
        )
    },
    {
      kind: 'validate',
      label: m.join_action_validate_all(),
      onclick: () => handleValidate(toVerifyEntries),
      disabled: !toVerifyEntries.some((entry) => entry.basemapValue)
    }
  ]);

  const unrecognizedHeaderSlots = $derived<HeaderSlot[]>([
    'info',
    {
      kind: 'ignore',
      label: m.join_action_ignore_all(),
      onclick: () =>
        handleIgnore(
          unknowns.map((dataValue) => ({ dataValue, source: 'unrecognized' }))
        )
    },
    null
  ]);

  const ignoredHeaderSlots = $derived<HeaderSlot[]>([
    {
      kind: 'restore',
      label: m.join_action_restore_all(),
      onclick: () => handleRestore(ignoredEntities.map((e) => e.dataValue))
    }
  ]);
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

{#snippet tableHeader(
  valueLabel: string,
  slots: HeaderSlot[] | null,
  relation: '=' | '≈' | null
)}
  <div class="table-header">
    <div class="table-header-data">
      <span class="table-header-label">{m.join_data_column()}</span>
      {#if linkedVariableName}
        <VariableBadge
          label={linkedVariableName}
          type="geo-ref"
          ariaLabel={m.join_linked_variable_edit()}
          onclick={showLinkedVariableField}
        />
      {/if}
    </div>
    {#if relation}
      <span
        class="table-cell cell-equals header-relation"
        class:cell-equals-approx={relation === '≈'}
        aria-hidden="true">{relation}</span
      >
    {/if}
    <span class="table-header-label table-header-value">{valueLabel}</span>
    {#if slots}
      <div class="row-actions">
        {#each slots as slot, slotIndex (slotIndex)}
          {#if slot === 'info'}
            <span class="row-action row-action-info" aria-hidden="true"></span>
          {:else if slot === null}
            <span class="row-action" aria-hidden="true"></span>
          {:else}
            <button
              type="button"
              class="row-action"
              class:row-action-disabled={slot.disabled}
              aria-label={slot.label}
              aria-disabled={slot.disabled || undefined}
              data-tooltip={slot.label}
              onclick={() => {
                if (!slot.disabled) slot.onclick();
              }}
            >
              {#if slot.kind === 'ignore'}
                <NotAllowed size={20} />
              {:else if slot.kind === 'validate'}
                <CheckmarkFilled size={20} />
              {:else}
                <Reset size={20} />
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<div
  bind:this={sectionElement}
  class="join-assisted-section"
  class:is-narrow={isNarrow}
  bind:clientWidth={sectionWidth}
>
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
      <MagicWandFilled size={20} />
    </span>
    <InfoPopover text={m.join_assisted_info()} />
  </div>

  <div
    class="join-assisted-content"
    class:is-loading={loading}
    use:actionTooltips
  >
    <div class="category-rows">
      {#if joinedCount > 0}
        <div class="category-row category-row-joined">
          <JoinCategoryHeader
            tone="success"
            icon={CheckmarkFilled}
            count={joinedCount}
            label={isSingularCount(joinedCount)
              ? m.join_entities_joined_one()
              : m.join_entities_joined()}
            expanded={isCategoryExpanded('matched')}
            onclick={() => toggleCategory('matched')}
          />
          {#if joinedExpanded}
            <div class="category-body">
              {#if joinedEntitiesList.length > 0}
                <div class="join-table join-table-success">
                  {@render tableHeader(
                    m.join_basemap_column(),
                    joinedHeaderSlots,
                    '='
                  )}
                  <div class="join-table-scroll" bind:this={joinedScrollEl}>
                    {#each joinedEntitiesList as row, joinedIndex (row.dataValue)}
                      {@const joinedDisplayedValue =
                        resolveDisplayedBasemapValue(row.basemapValue)}
                      {@const joinedCleared = clearedJoinedRows.has(
                        row.dataValue
                      )}
                      {@const joinedTooltip = joinedCleared
                        ? buildRowTooltip(undefined)
                        : buildRowTooltip(
                            row.basemapValue,
                            row.otherIdentifiers
                          )}
                      <div
                        class="table-row"
                        use:observeRow={row.dataValue}
                        use:mapHoverValue={row.dataValue}
                      >
                        <div class="table-cell cell-data" title={row.dataValue}>
                          {row.dataValue}
                        </div>
                        <div class="table-cell cell-equals">=</div>
                        <div class="table-cell cell-select" use:titleMenuToggle>
                          {#if visibleJoinedRows.has(row.dataValue) && !basemapValuesLoading}
                            {@const joinedRowOptions = buildJoinedRowOptions(
                              row.basemapValue
                            )}
                            {#key joinedValueSignature}
                              <ComboBox
                                translateWithId={translateCarbonId}
                                translateWithIdSelection={translateCarbonId}
                                portalMenu
                                autoHighlight="first-match"
                                id={`${comboIdPrefix}-joined-${joinedIndex}`}
                                items={joinedRowOptions}
                                selectedId={joinedCleared
                                  ? undefined
                                  : joinedDisplayedValue}
                                placeholder={m.join_unrecognized_correction_placeholder()}
                                {...{ title: joinedDisplayedValue }}
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
                                  if (nextValue) {
                                    setJoinedRowCleared(row.dataValue, false);
                                  }
                                  if (
                                    nextValue &&
                                    nextValue !== joinedDisplayedValue &&
                                    onManualCorrection
                                  ) {
                                    onManualCorrection(
                                      row.dataValue,
                                      nextValue
                                    );
                                    announce(
                                      m.join_announce_remapped({
                                        entity: row.dataValue
                                      })
                                    );
                                  }
                                }}
                                invalid={joinedCleared}
                                on:clear={() =>
                                  setJoinedRowCleared(row.dataValue, true)}
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
                              {basemapValuesLoading || joinedCleared
                                ? ''
                                : joinedDisplayedValue}
                            </div>
                          {/if}
                        </div>
                        <div class="row-actions">
                          <span class="row-action row-action-info">
                            <InfoPopover
                              text={joinedTooltip.text}
                              tags={joinedTooltip.tags}
                              disabled={joinedTooltip.disabled}
                              title={m.join_info_basemap_title()}
                            />
                          </span>
                          <button
                            type="button"
                            class="row-action"
                            aria-label={m.join_action_ignore()}
                            data-tooltip={m.join_action_ignore()}
                            onclick={() =>
                              handleIgnore([
                                {
                                  dataValue: row.dataValue,
                                  source: 'joined',
                                  basemapValue: row.basemapValue
                                }
                              ])}
                          >
                            <NotAllowed size={20} />
                          </button>
                          <button
                            type="button"
                            class="row-action row-action-validate row-action-disabled"
                            aria-label={m.join_action_validated()}
                            aria-disabled="true"
                            data-tooltip={m.join_action_validated()}
                          >
                            <CheckmarkFilled size={20} />
                          </button>
                        </div>
                      </div>
                    {/each}
                  </div>
                  {#if showJoinedPagination}
                    <Pagination
                      page={joinedPage}
                      pageSize={joinedPageSize}
                      pageSizes={[joinedPageSize]}
                      totalItems={joinedCount}
                      pageSizeInputDisabled
                      size="sm"
                      forwardText={m.join_pagination_next()}
                      backwardText={m.join_pagination_previous()}
                      itemRangeText={(min, max, total) =>
                        m.join_pagination_item_range({
                          min: formatValue(min),
                          max: formatValue(max),
                          total: formatValue(total)
                        })}
                      pageRangeText={(_current, total) =>
                        m.join_pagination_page_range({
                          total: formatValue(total)
                        })}
                      on:update={(event) => {
                        if (event.detail.page !== joinedPage) {
                          onJoinedPageChange?.(event.detail.page);
                        }
                      }}
                    />
                  {/if}
                </div>
              {:else}
                <p class="category-body-text">
                  {m.join_entities_joined_desc()}
                </p>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      {#if toVerifyCount > 0}
        <div class="category-row category-row-verify">
          <JoinCategoryHeader
            tone="warning"
            icon={WarningFilled}
            count={toVerifyCount}
            label={isSingularCount(toVerifyCount)
              ? m.join_entities_to_verify_one()
              : m.join_entities_to_verify()}
            expanded={isCategoryExpanded('check')}
            onclick={() => toggleCategory('check')}
          />
          {#if toVerifyExpanded}
            <div class="category-body">
              <div class="join-table join-table-warning">
                {@render tableHeader(
                  m.join_basemap_column(),
                  toVerifyHeaderSlots,
                  '≈'
                )}
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
                    {@const verifyTooltip = buildToVerifyTooltip(
                      selectedMapping,
                      selectedCandidate
                    )}
                    <div
                      class="table-row"
                      use:observeToVerifyRow={rowKey}
                      use:mapHoverValue={row.dataValue}
                    >
                      <div class="table-cell cell-data" title={row.dataValue}>
                        {row.dataValue}
                      </div>
                      <div
                        class="table-cell cell-equals cell-equals-approx"
                        aria-label={m.join_approximate_indicator()}
                      >
                        <span class="approx-symbol" aria-hidden="true">≈</span>
                      </div>
                      <div class="table-cell cell-select" use:titleMenuToggle>
                        {#if visibleToVerifyRows.has(rowKey) && !basemapValuesLoading}
                          {@const toVerifyItems = buildToVerifyItems(
                            row.basemapOptions
                          )}
                          {#key basemapComboBoxItems}
                            <ComboBox
                              translateWithId={translateCarbonId}
                              translateWithIdSelection={translateCarbonId}
                              portalMenu
                              autoHighlight="first-match"
                              id={`${comboIdPrefix}-${i}`}
                              items={toVerifyItems}
                              selectedId={selectedMapping
                                ? resolveDisplayedBasemapValue(selectedMapping)
                                : undefined}
                              {...{
                                title:
                                  resolveDisplayedBasemapValue(selectedMapping)
                              }}
                              placeholder={m.join_unrecognized_correction_placeholder()}
                              labelText={m.join_select_label_to_verify({
                                entity: row.dataValue
                              })}
                              hideLabel
                              size="sm"
                              shouldFilterItem={(item, value) =>
                                value ===
                                  resolveDisplayedBasemapValue(
                                    selectedMapping
                                  ) || shouldFilterBasemapItem(item, value)}
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
                              on:clear={() => {
                                activeComboQuery = null;
                                toVerifySelectedMappings[rowKey] = '';
                              }}
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
                            {basemapValuesLoading || !row.selectedMapping
                              ? ''
                              : resolveDisplayedBasemapValue(
                                  row.selectedMapping
                                )}
                          </div>
                        {/if}
                      </div>
                      <div class="row-actions">
                        <span class="row-action row-action-info">
                          <InfoPopover
                            text={verifyTooltip.text}
                            tags={verifyTooltip.tags}
                            disabled={verifyTooltip.disabled}
                            title={m.join_info_basemap_title()}
                          />
                        </span>
                        <button
                          type="button"
                          class="row-action"
                          aria-label={m.join_action_ignore()}
                          data-tooltip={m.join_action_ignore()}
                          onclick={() =>
                            handleIgnore([
                              {
                                dataValue: row.dataValue,
                                source: 'to_verify',
                                basemapValue: selectedMapping
                              }
                            ])}
                        >
                          <NotAllowed size={20} />
                        </button>
                        <button
                          type="button"
                          class="row-action row-action-validate"
                          class:row-action-disabled={!selectedMapping}
                          aria-label={m.join_action_validate()}
                          aria-disabled={!selectedMapping || undefined}
                          data-tooltip={selectedMapping
                            ? m.join_action_validate()
                            : m.join_action_validate_disabled()}
                          onclick={() =>
                            handleValidate([
                              {
                                dataValue: row.dataValue,
                                basemapValue: selectedMapping
                              }
                            ])}
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
      {/if}

      {#if unrecognizedCount > 0 || showFuzzyPassOffer}
        <div class="category-row category-row-unrecognized">
          <JoinCategoryHeader
            tone="error"
            icon={ErrorFilled}
            count={unrecognizedCount}
            label={isSingularCount(unrecognizedCount)
              ? m.join_entities_unrecognized_one()
              : m.join_entities_unrecognized()}
            expanded={isCategoryExpanded('unrecognized')}
            onclick={() => toggleCategory('unrecognized')}
          />
          {#if showFuzzyPassOffer}
            <div class="fuzzy-pass-offer">
              <InlineNotification
                kind="info"
                lowContrast
                hideCloseButton
                title={m.join_fuzzy_pass_title()}
                subtitle={(isSingularCount(fuzzyPassEstimate?.candidates ?? 0)
                  ? m.join_fuzzy_pass_subtitle_one
                  : m.join_fuzzy_pass_subtitle)({
                  count: formatValue(fuzzyPassEstimate?.candidates ?? 0),
                  seconds: fuzzyPassSeconds
                })}
              />
              <div class="fuzzy-pass-actions">
                {#if fuzzyPassRunning}
                  <InlineLoading description={m.join_fuzzy_pass_running()} />
                {:else}
                  <Button
                    kind="tertiary"
                    size="small"
                    icon={MagicWandFilled}
                    on:click={() => onRunFullFuzzyPass?.()}
                  >
                    {m.join_fuzzy_pass_action()}
                  </Button>
                {/if}
              </div>
            </div>
          {/if}
          {#if unrecognizedExpanded && unrecognizedCount > 0}
            <div class="category-body">
              <div class="join-table join-table-error">
                {@render tableHeader(
                  m.join_basemap_column(),
                  unrecognizedHeaderSlots,
                  '='
                )}
                <div class="join-table-scroll" bind:this={unrecognizedScrollEl}>
                  {#each unknowns as entity, unknownIndex (entity)}
                    {@const pendingSelection =
                      getPendingUnrecognizedSelection(entity)}
                    {@const hasPendingSelection =
                      pendingSelection !== undefined}
                    {@const unrecognizedTooltip =
                      buildRowTooltip(pendingSelection)}
                    <div class="table-row" use:observeUnrecognizedRow={entity}>
                      <div class="table-cell cell-data" title={entity}>
                        {entity}
                      </div>
                      <div class="table-cell cell-equals">=</div>
                      <div class="table-cell cell-select" use:titleMenuToggle>
                        {#if visibleUnrecognizedRows.has(entity)}
                          {#if basemapComboBoxItems.length > 0 && onManualCorrection}
                            {#key basemapComboBoxItems}
                              <ComboBox
                                translateWithId={translateCarbonId}
                                translateWithIdSelection={translateCarbonId}
                                portalMenu
                                autoHighlight="first-match"
                                id={`${comboIdPrefix}-unrecognized-${unknownIndex}`}
                                items={basemapComboBoxItems}
                                selectedId={pendingSelection}
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
                                on:clear={() =>
                                  handleUnrecognizedSelect(entity, undefined)}
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
                            title={m.join_info_basemap_title()}
                          />
                        </span>
                        <button
                          type="button"
                          class="row-action"
                          aria-label={m.join_action_ignore()}
                          data-tooltip={m.join_action_ignore()}
                          onclick={() =>
                            handleIgnore([
                              { dataValue: entity, source: 'unrecognized' }
                            ])}
                        >
                          <NotAllowed size={20} />
                        </button>
                        <button
                          type="button"
                          class="row-action row-action-validate"
                          class:row-action-disabled={!hasPendingSelection}
                          aria-label={m.join_action_validate()}
                          aria-disabled={!hasPendingSelection || undefined}
                          data-tooltip={hasPendingSelection
                            ? m.join_action_validate()
                            : m.join_action_validate_disabled()}
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
      {/if}

      {#if duplicateCount > 0}
        <div class="category-row category-row-duplicates">
          <JoinCategoryHeader
            tone="error"
            icon={WarningAltFilled}
            count={duplicateCount}
            label={isSingularCount(duplicateCount)
              ? m.join_entities_duplicate_one()
              : m.join_entities_duplicate()}
            expanded={isCategoryExpanded('duplicate')}
            onclick={() => toggleCategory('duplicate')}
          />
          {#if duplicatesExpanded}
            <div class="category-body">
              <div class="inline-banner inline-banner-error">
                {m.join_duplicates_explanation()}
              </div>
              <div class="join-table join-table-error">
                {@render tableHeader(m.join_lines_column(), null, null)}
                {#each duplicates as entity (entity)}
                  <div
                    class="table-row table-row-lines"
                    use:mapHoverValue={entity}
                  >
                    <div class="table-cell cell-data" title={entity}>
                      {entity}
                    </div>
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
          <JoinCategoryHeader
            tone="ignored"
            icon={NotAllowed}
            count={ignoredCount}
            label={isSingularCount(ignoredCount)
              ? m.join_entities_ignored_one()
              : m.join_entities_ignored()}
            expanded={isCategoryExpanded('ignored')}
            onclick={() => toggleCategory('ignored')}
          />
          {#if ignoredExpanded}
            <div class="category-body">
              <div class="inline-banner inline-banner-info">
                {m.join_ignored_explanation()}
              </div>
              <div class="join-table join-table-info">
                {@render tableHeader(
                  m.join_line_column(),
                  ignoredHeaderSlots,
                  null
                )}
                {#each ignoredEntities as entry (entry.dataValue)}
                  <div class="table-row table-row-lines">
                    <div class="table-cell cell-data" title={entry.dataValue}>
                      {entry.dataValue}
                    </div>
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
                        data-tooltip={m.join_action_restore()}
                        onclick={() => handleRestore([entry.dataValue])}
                      >
                        <Reset size={20} />
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
      {#if hasClearedJoins}
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={m.join_cleared_title()}
          subtitle={m.join_cleared_subtitle()}
        />
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
            {displayedNotificationState.unresolvedCount > 0
              ? m.join_validation_desc_partial()
              : m.join_validation_desc()}
          </p>
          <Button kind="primary" size="small" on:click={onFinalizeJoin}
            >{m.join_validation_button()}</Button
          >
        </div>
      {/if}
      {#if showUnresolvedNotice}
        <InlineNotification
          closeButtonDescription={m.a11y_close_notification()}
          title={joinedCount > 0
            ? m.join_unresolved_title()
            : m.join_error_detected_title()}
          subtitle={joinedCount > 0
            ? m.join_unresolved_subtitle()
            : m.join_error_detected_subtitle()}
          kind={joinedCount > 0 ? 'info' : 'warning'}
          lowContrast
          on:close={() => (footerDismissed = true)}
        />
      {/if}
    </div>
  </div>
</div>

{#if actionTooltipTrigger && actionTooltipText}
  <TooltipBubble text={actionTooltipText} trigger={actionTooltipTrigger} />
{/if}

<style>
  .fuzzy-pass-offer {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0 1rem 0.75rem;
  }

  .fuzzy-pass-actions {
    display: flex;
    justify-content: flex-end;
  }

  .join-assisted-section {
    --join-font: var(--kh-font-body);
    --join-col-gap: var(--kh-gap-inline);
    --join-row-padding: var(--kh-gap-inline);
    --join-equals-width: var(--kh-size-xs);
    --join-control-height: var(--kh-size-sm);
    /* rem follows the compact density, which scales the root font down. */
    --join-action-size: var(--kh-size-xs);
    --join-icon-size: 1rem;
    --join-info-icon-size: 0.875rem;
    --join-combo-icon-width: 1.5rem;
    --join-combo-icon-right: 0.5rem;

    --join-text: #161616;
    --join-text-secondary: #525252;
    --join-row-bg: #f4f4f4;
    --join-row-border: #c6c6c6;
    --join-divider: #e0e0e0;
    --join-action-hover: rgba(0, 0, 0, 0.05);
    --join-icon-disabled: rgba(22, 22, 22, 0.25);
    --join-success: var(--khartis-additions-join-success);
    --join-success-bg: var(--khartis-additions-join-success-bg);
    --join-success-line: rgba(36, 161, 72, 0.3);
    --join-success-text: #044317;
    --join-warning: var(--khartis-additions-join-warning);
    --join-warning-bg: var(--khartis-additions-join-warning-bg);
    --join-warning-line: rgba(241, 194, 27, 0.3);
    --join-error: var(--khartis-additions-join-error);
    --join-error-bg: var(--khartis-additions-join-error-bg);
    --join-error-line: rgba(218, 30, 40, 0.3);
    --join-info: #0043ce;
    --join-info-bg: #edf5ff;
    --join-info-line: rgba(0, 67, 206, 0.3);
    display: flex;
    flex-direction: column;
    gap: 0;
    padding-top: 20px;
  }

  .join-assisted-content {
    min-height: clamp(320px, 40vh, 500px);
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-param);
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
    gap: var(--kh-gap-inline);
    padding-bottom: var(--kh-pad-panel);
  }

  .section-header-icon {
    display: flex;
    align-items: center;
    color: var(--khartis-additions-interactive-suggestions, #0072c3);
  }

  .section-title {
    font-size: var(--kh-font-primitive);
    font-weight: var(--kh-weight-primitive);
    line-height: var(--kh-line-primitive);
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
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

  .category-body {
    padding: 0 var(--kh-pad-panel) var(--kh-pad-panel);
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-inline);
  }

  .category-body-text {
    font-size: 0.8125rem;
    line-height: 1.25rem;
    color: var(--join-text-secondary);
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
    background-color: var(--join-error-bg);
    border-left-color: var(--join-error);
    color: var(--join-text);
  }

  .inline-banner-info {
    background-color: var(--join-info-bg);
    border-left-color: var(--join-info);
    color: var(--join-text);
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
    background-color: var(--join-success-bg);
    border-bottom: 1px solid var(--join-success-line);
  }
  .join-table-warning .table-header {
    background-color: var(--join-warning-bg);
    border-bottom: 1px solid var(--join-warning-line);
  }
  .join-table-error .table-header {
    background-color: var(--join-error-bg);
    border-bottom: 1px solid var(--join-error-line);
  }
  .join-table-info .table-header {
    background-color: var(--join-info-bg);
    border-bottom: 1px solid var(--join-info-line);
  }

  .join-table .table-row {
    background-color: var(--join-row-stripe, var(--join-row-bg));
    border-bottom: 1px solid var(--join-row-border);
  }
  .join-table .table-row:last-child {
    border-bottom: none;
  }

  /* Alternating rows and a hovered row, as in the data table. The alternate
     row only leans towards the field color, so its dropdown still stands
     out. */
  .join-table .table-row:nth-child(even of .table-row) {
    --join-row-stripe: color-mix(
      in srgb,
      var(--join-row-bg) 65%,
      var(--cds-field-02, #ffffff)
    );
  }

  .join-table .table-row:hover {
    background-color: var(--cds-hover-ui, #e5e5e5);
  }

  /* Header and rows share one column grid, so every header label sits above
     the cell it names and every bulk action above its row actions. */
  .table-header,
  .table-row {
    display: grid;
    grid-template-columns:
      minmax(0, 1fr) var(--join-equals-width) minmax(0, 1fr)
      auto;
    grid-template-areas: 'data equals value actions';
    align-items: center;
    column-gap: var(--join-col-gap);
    padding: var(--join-row-padding);
    box-sizing: border-box;
  }

  /* Top-aligned cells, each at least one action tall: a single-line header
     looks centred, a wrapped one keeps its first line level with the rest. */
  .table-header {
    align-items: start;
    min-height: var(--kh-size-md);
  }

  .table-header-data,
  .table-header-value,
  .table-header .header-relation {
    min-height: var(--join-action-size);
  }

  .table-header-data {
    grid-area: data;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--kh-gap-label) var(--kh-gap-inline);
    min-width: 0;
    max-width: 100%;
  }

  .table-header-data :global(.variable-badge) {
    flex: 0 1 auto;
  }

  .table-header .header-relation {
    display: none;
  }

  .table-header-value {
    grid-area: value;
    display: flex;
    align-items: center;
  }

  .table-header .row-actions {
    grid-area: actions;
  }

  .table-header .row-action.row-action-info {
    border-right-color: transparent;
  }

  .table-header-label {
    font-weight: 600;
    font-size: var(--join-font);
    line-height: var(--kh-line-group);
    letter-spacing: 0.16px;
    color: var(--join-text);
  }

  .table-row {
    min-height: var(--kh-size-lg);
  }

  .table-row-lines {
    min-height: var(--kh-size-md);
  }

  .table-row .row-actions {
    grid-area: actions;
  }

  .table-cell {
    font-weight: 400;
    font-size: var(--join-font);
    line-height: var(--kh-line-body);
    letter-spacing: 0.16px;
    color: var(--join-text);
  }

  .cell-data {
    grid-area: data;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  .cell-equals {
    grid-area: equals;
    font-weight: 700;
    font-size: 1rem;
    line-height: 1;
    color: var(--cds-text-secondary, #525252);
    width: var(--join-equals-width);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .join-table-success .cell-equals {
    color: var(--join-success);
  }
  .join-table-warning .cell-equals {
    color: var(--join-warning);
  }
  .join-table-error .cell-equals {
    color: var(--join-error);
  }

  .cell-equals-approx {
    color: var(--join-warning);
  }

  .combo-item {
    display: flex;
    align-items: baseline;
    gap: var(--kh-gap-inline);
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
    border-top: 1px solid var(--join-divider);
  }

  :global([data-floating-portal] [id^='menu-join-'].bx--list-box__menu) {
    min-width: 100%;
    width: max-content;
    max-width: 26rem;
  }

  :global(
    [data-floating-portal] [id^='menu-join-'] .bx--list-box__menu-item__option
  ) {
    font-size: var(--kh-font-body);
  }

  :global(
    [data-floating-portal] [id^='menu-join-sm-'] .bx--list-box__menu-item
  ) {
    height: 1.75rem;
  }

  :global(
    [data-floating-portal]
      [id^='menu-join-sm-']
      .bx--list-box__menu-item__option
  ) {
    font-size: 0.75rem;
    padding-block: 0.25rem;
  }

  .cell-select {
    grid-area: value;
    overflow: visible;
    min-width: 0;
  }

  .cell-select :global(.bx--select),
  .cell-select :global(.bx--list-box) {
    margin: 0;
  }

  .cell-select :global(.bx--select-input),
  .cell-select :global(.bx--text-input) {
    height: var(--join-control-height);
    padding: 0
      calc(var(--join-combo-icon-right) + var(--join-combo-icon-width) + 4px) 0
      0.75rem;
    font-size: var(--join-font);
    background-color: var(--cds-field-02, #ffffff);
    text-overflow: ellipsis;
  }

  /* The list box draws the only bottom border; the input inside it has none,
     otherwise a shorter input shows a second line. */
  .cell-select :global(.bx--select-input) {
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
  }

  .cell-select :global(.bx--list-box) {
    height: var(--join-control-height);
    max-height: none;
    background-color: var(--cds-field-02, #ffffff);
  }

  .cell-select :global(.bx--combo-box .bx--text-input) {
    border-bottom: none;
  }

  .cell-select :global(.bx--list-box__menu-icon) {
    right: var(--join-combo-icon-right);
    width: var(--join-combo-icon-width);
  }

  .cell-select :global(.bx--list-box__selection) {
    right: calc(var(--join-combo-icon-right) + var(--join-combo-icon-width));
    width: var(--join-combo-icon-width);
  }

  /* Carbon adds a clear button next to the chevron once a value is selected. */
  .cell-select
    :global(
      .bx--list-box__field:has(.bx--list-box__selection) .bx--text-input
    ) {
    padding-right: calc(
      var(--join-combo-icon-right) + 2 * var(--join-combo-icon-width) + 4px
    );
  }

  .cell-select :global(.bx--select__arrow) {
    height: var(--join-control-height);
  }

  .cell-select :global(.bx--label) {
    display: none;
  }

  .select-placeholder {
    height: var(--join-control-height);
    padding: 0 2rem 0 0.75rem;
    font-size: var(--join-font);
    background-color: var(--cds-field-02, #ffffff);
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
    display: flex;
    align-items: center;
    color: var(--cds-text-secondary, #525252);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-lines {
    grid-area: value;
    font-variant-numeric: tabular-nums;
    color: var(--join-text-secondary);
  }

  .row-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--kh-gap-label);
  }

  .row-actions-compact {
    gap: 0;
  }

  .row-action {
    width: var(--join-action-size);
    height: var(--join-action-size);
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

  .row-action :global(svg) {
    width: var(--join-icon-size);
    height: var(--join-icon-size);
  }

  .row-action.row-action-info {
    box-sizing: content-box;
    margin-right: var(--kh-gap-label);
    padding-right: var(--join-col-gap);
    border-right: 1px solid var(--join-divider);
    border-radius: 0;
  }

  .row-action:hover:not(.row-action-disabled) {
    background-color: var(--join-action-hover);
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
    min-width: 0;
    min-height: 0;
  }

  .row-action.row-action-info :global(svg) {
    width: var(--join-info-icon-size);
    height: var(--join-info-icon-size);
  }

  .row-action-validate {
    color: var(--join-text);
  }

  .row-action-disabled {
    color: var(--join-icon-disabled);
    cursor: not-allowed;
  }

  .row-action-disabled :global(svg) {
    fill: var(--join-icon-disabled);
  }

  .join-status-zone {
    flex-shrink: 0;
    padding-top: var(--kh-gap-param);
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-inline);
  }

  .join-status-zone :global(.bx--inline-notification) {
    max-width: none;
    margin: 0;
  }

  .notification-success {
    display: flex;
    align-items: center;
    gap: var(--kh-gap-inline);
    padding: var(--kh-pad-panel);
    background-color: var(--join-success-bg);
    border-left: 3px solid var(--join-success);
  }

  .notification-success-icon :global(svg) {
    fill: var(--join-success);
  }

  .notification-success-text {
    font-weight: 600;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--join-success-text);
  }

  .notification-validation {
    padding: var(--kh-pad-panel);
    background-color: var(--join-success-bg);
    border-left: 3px solid var(--join-success);
  }

  .notification-title {
    font-weight: 600;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--join-text);
    margin-bottom: 4px;
  }

  .notification-message {
    font-weight: 400;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--join-text-secondary);
    margin-bottom: 8px;
  }

  /* Carbon g100 counterparts of the light palette above. */
  :global(html[theme='g100']) .join-assisted-section {
    --join-text: #f4f4f4;
    --join-text-secondary: #c6c6c6;
    --join-row-bg: #262626;
    --join-row-border: #393939;
    --join-divider: #525252;
    --join-action-hover: rgba(255, 255, 255, 0.1);
    --join-icon-disabled: rgba(244, 244, 244, 0.25);
    --join-success-line: rgba(66, 190, 101, 0.4);
    --join-success-text: #a7f0ba;
    --join-warning-line: rgba(241, 194, 27, 0.4);
    --join-error-line: rgba(250, 77, 86, 0.4);
    --join-info: #4589ff;
    --join-info-bg: #001141;
    --join-info-line: rgba(69, 137, 255, 0.4);
  }

  /* A panel this narrow leaves no room beside the entity name, so the
     basemap field moves under it. */
  .is-narrow .join-assisted-content {
    --join-font: 0.75rem;
    --join-col-gap: 4px;
    --join-row-padding: 8px 6px;
    --join-equals-width: 0.75rem;
    --join-control-height: 1.5rem;
    --join-action-size: 1.25rem;
    --join-icon-size: 0.875rem;
    --join-info-icon-size: 0.75rem;
    --join-combo-icon-width: 1.25rem;
    --join-combo-icon-right: 0.125rem;
  }

  .is-narrow .table-header,
  .is-narrow .table-row {
    grid-template-columns: var(--join-equals-width) minmax(0, 1fr) auto;
    grid-template-areas:
      'data data data'
      'equals value actions';
    row-gap: 4px;
  }

  .is-narrow .table-header {
    grid-template-areas:
      'data data actions'
      'equals value .';
  }

  .is-narrow .table-header .header-relation {
    display: inline-flex;
  }

  .is-narrow .table-header-data {
    flex-wrap: nowrap;
  }

  .is-narrow .table-header-data .table-header-label {
    flex-shrink: 0;
    white-space: nowrap;
  }

  .is-narrow .table-header-data :global(.variable-badge) {
    min-width: 0;
  }

  .is-narrow .table-row-lines {
    grid-template-areas: 'data data data' '. value actions';
  }

  .is-narrow .cell-select :global(.bx--text-input),
  .is-narrow .select-placeholder {
    padding-left: 0.5rem;
  }
</style>
