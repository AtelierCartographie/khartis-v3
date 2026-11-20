<script lang="ts">
  import { Modal } from 'carbon-components-svelte';
  import { m } from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { globalState } from '../stores/global.svelte';
  import {
    detectApplePlatform,
    getPrimaryShortcutLabel,
    getSingleKeyShortcutLabel,
    getZoomShortcutModifiers,
    resolveShortcutLocale,
    type SingleKeyShortcutId
  } from '../utils/keyboard-shortcuts.utils';

  interface ShortcutRow {
    label: string;
    keys: string;
  }

  interface ShortcutSection {
    title: string;
    rows: ShortcutRow[];
  }

  const singleKeyLabels: Record<SingleKeyShortcutId, () => string> = {
    stepData: () => m.step_data(),
    stepVisualizations: () => m.step_visualizations(),
    stepStyling: () => m.step_styling(),
    mainMenu: () => m.shortcuts_main_menu(),
    zoomMode: () => m.shortcuts_zoom_mode(),
    toolSearch: () => m.tool_search(),
    toolLayers: () => m.tool_layers(),
    toolProjection: () => m.tool_projection(),
    toolSimplification: () => m.tool_simplification(),
    toolFacets: () => m.tool_facets(),
    toolFormat: () => m.tool_format(),
    toolLegend: () => m.tool_legend(),
    toolGeoIndications: () => m.tool_geo_indications(),
    toolAnnotations: () => m.tool_annotations(),
    toolColorBlindness: () => m.tool_color_blindness(),
    toggleGrid: () => m.shortcuts_toggle_grid()
  };

  function singleKeyRows(ids: SingleKeyShortcutId[]): ShortcutRow[] {
    const locale = resolveShortcutLocale(getLocale());
    return ids.map((id) => ({
      label: singleKeyLabels[id](),
      keys: getSingleKeyShortcutLabel(id, locale)
    }));
  }

  const sections = $derived.by((): ShortcutSection[] => {
    if (!globalState.isShortcutsSheetOpen) return [];

    const isApplePlatform = detectApplePlatform();
    const { primary } = getZoomShortcutModifiers(isApplePlatform);

    return [
      {
        title: m.shortcuts_section_steps(),
        rows: [
          ...singleKeyRows([
            'stepData',
            'stepVisualizations',
            'stepStyling',
            'mainMenu'
          ]),
          { label: m.shortcuts_close(), keys: 'Esc' },
          { label: m.shortcuts_open_sheet(), keys: '?' }
        ]
      },
      {
        title: m.shortcuts_section_visualizations(),
        rows: singleKeyRows([
          'toolSearch',
          'toolLayers',
          'toolProjection',
          'toolSimplification',
          'toolFacets'
        ])
      },
      {
        title: m.shortcuts_section_styling(),
        rows: singleKeyRows([
          'toolFormat',
          'toolLegend',
          'toolGeoIndications',
          'toolAnnotations',
          'toolColorBlindness',
          'toggleGrid'
        ])
      },
      {
        title: m.shortcuts_section_project(),
        rows: [
          {
            label: m.sidenav_new_project(),
            keys: getPrimaryShortcutLabel('newProject', isApplePlatform)
          },
          {
            label: m.sidenav_open_project(),
            keys: getPrimaryShortcutLabel('openProject', isApplePlatform)
          },
          {
            label: m.sidenav_save_project(),
            keys: getPrimaryShortcutLabel('saveProject', isApplePlatform)
          },
          {
            label: m.download_button(),
            keys: getPrimaryShortcutLabel('download', isApplePlatform)
          }
        ]
      },
      {
        title: m.shortcuts_section_view(),
        rows: [
          ...singleKeyRows(['zoomMode']),
          { label: m.shortcuts_zoom(), keys: `${primary} + / ${primary} −` },
          { label: m.shortcuts_zoom_reset(), keys: `${primary} 0` },
          { label: m.shortcuts_pan_page(), keys: m.shortcuts_pan_page_keys() }
        ]
      }
    ];
  });
</script>

<Modal
  passiveModal
  size="sm"
  iconDescription={m.a11y_close_dialog()}
  modalHeading={m.shortcuts_sheet_title()}
  open={globalState.isShortcutsSheetOpen}
  on:close={() => (globalState.isShortcutsSheetOpen = false)}
>
  <p class="shortcuts-hint">{m.shortcuts_sheet_hint()}</p>

  {#each sections as section (section.title)}
    <section class="shortcuts-section">
      <h3>{section.title}</h3>
      <dl>
        {#each section.rows as row (row.label)}
          <div class="shortcuts-row">
            <dt>{row.label}</dt>
            <dd><kbd>{row.keys}</kbd></dd>
          </div>
        {/each}
      </dl>
    </section>
  {/each}
</Modal>

<style>
  .shortcuts-hint {
    margin-block-end: var(--cds-spacing-05);
    color: var(--cds-text-02);
  }

  .shortcuts-section {
    margin-block-end: var(--cds-spacing-05);
  }

  h3 {
    margin-block-end: var(--cds-spacing-03);
    font-size: var(--cds-productive-heading-02-font-size, 1rem);
    font-weight: 600;
  }

  .shortcuts-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-05);
    padding-block: var(--cds-spacing-02);
    border-block-end: 1px solid var(--cds-ui-03);
  }

  dd {
    margin: 0;
  }

  kbd {
    padding: 0 var(--cds-spacing-03);
    border: 1px solid var(--cds-ui-04);
    border-radius: 3px;
    background: var(--cds-ui-01);
    font-family: inherit;
    font-size: 0.875rem;
    white-space: nowrap;
  }
</style>
