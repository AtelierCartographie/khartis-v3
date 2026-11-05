<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import { InfoPopover } from '$lib/features/commons/components/viz-controls';
  import { m } from '$lib/paraglide/messages';
  import { CodeSnippet } from 'carbon-components-svelte';
  import { Code, SettingsAdjust } from 'carbon-icons-svelte';
  import { formatValue } from '$lib/features/commons/utils/format.utils';
  import { resolveCurrentProjectionDisplay } from './projection-label.utils';
  import { getCurrentProjectionContext } from './projection-georeference.utils';
  import {
    resolveCurrentProjectionDefinition,
    type ProjectionDefinitionNote
  } from './projection-definition.utils';

  interface Props {
    onopensettings: () => void;
  }

  let { onopensettings }: Props = $props();

  let definitionOpen = $state(false);

  const context = $derived(getCurrentProjectionContext());
  const isTiledBasemapEnabled = $derived(context.tiled !== null);
  const display = $derived(
    context.tiled
      ? {
          name: context.tiled.globe
            ? m.map_projection_globe()
            : m.projection_current_web_mercator(),
          description: m.projection_tiled_helper()
        }
      : resolveCurrentProjectionDisplay(
          context.state,
          context.basemapProjection,
          context.projectionPresets
        )
  );
  const definition = $derived(
    definitionOpen ? resolveCurrentProjectionDefinition(context) : undefined
  );

  function describeNote(note: ProjectionDefinitionNote): string {
    switch (note) {
      case 'spherical':
        return m.projection_definition_note_spherical();
      case 'oblique':
        return m.projection_definition_note_oblique();
      case 'rotated':
        return m.projection_definition_note_rotated({
          rotation: formatValue(definition?.rotation ?? 0, {
            maxFractionDigits: 2
          })
        });
      case 'composite':
        return m.projection_definition_note_composite();
      case 'no-equivalent':
        return m.projection_definition_note_no_equivalent();
      case 'globe':
        return m.projection_definition_note_globe();
      case 'derived-wkt':
        return m.projection_definition_note_derived_wkt();
    }
  }
</script>

<div class="projection-current">
  <span class="projection-current-label">{m.projection_current_label()}</span>
  <div class="projection-current-row">
    <div class="projection-current-name-row">
      <span class="projection-current-name" title={display.name}
        >{display.name}</span
      >
      {#if display.description}
        <InfoPopover text={display.description} />
      {/if}
    </div>

    <div class="projection-current-actions">
      <Button
        kind="ghost"
        size="small"
        icon={Code}
        iconDescription={m.projection_definition_toggle()}
        tooltipPosition="bottom"
        aria-expanded={definitionOpen}
        on:click={() => (definitionOpen = !definitionOpen)}
      />
      {#if !isTiledBasemapEnabled}
        <Button
          kind="ghost"
          size="small"
          icon={SettingsAdjust}
          class="projection-current-settings"
          on:click={onopensettings}>{m.projection_current_settings()}</Button
        >
      {/if}
    </div>
  </div>

  {#if definition}
    <div class="projection-definition">
      {#if definition.epsg}
        <p class="projection-definition-epsg">EPSG:{definition.epsg}</p>
      {/if}
      {#if definition.proj4}
        <span class="projection-definition-label"
          >{m.projection_definition_proj4_label()}</span
        >
        <CodeSnippet
          type="multi"
          wrapText
          code={definition.proj4}
          feedback={m.projection_definition_copied()}
          errorFeedback={m.projection_definition_copy_failed()}
          copyButtonDescription={m.projection_definition_copy()}
          showMoreLess={false}
        />
      {/if}
      {#if definition.wkt}
        <span class="projection-definition-label"
          >{m.projection_definition_wkt_label()}</span
        >
        <CodeSnippet
          type="multi"
          wrapText
          code={definition.wkt}
          feedback={m.projection_definition_copied()}
          errorFeedback={m.projection_definition_copy_failed()}
          copyButtonDescription={m.projection_definition_copy()}
        />
      {/if}
      {#if definition.proj4 || definition.wkt || definition.epsg}
        <p class="projection-definition-note">
          {m.projection_definition_note_affine()}
        </p>
      {/if}
      {#each definition.notes as note (note)}
        <p class="projection-definition-note">{describeNote(note)}</p>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .projection-current {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-inline: calc(-1 * var(--kh-pad-panel));
    padding: var(--kh-gap-param) var(--kh-pad-panel);
    background: var(--cds-layer-01, #f4f4f4);
  }

  .projection-current-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--kh-gap-inline);
    min-width: 0;
  }

  .projection-current-label {
    color: var(--cds-text-secondary, #525252);
    font-size: var(--cds-label-01-font-size, 0.75rem);
    line-height: var(--cds-label-01-line-height, 1rem);
    letter-spacing: var(--cds-label-01-letter-spacing, 0.32px);
  }

  .projection-current-name-row {
    flex: 1 1 10rem;
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    min-width: 0;
  }

  .projection-current-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    margin-left: auto;
  }

  .projection-definition {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    margin-top: var(--cds-spacing-03);
    min-width: 0;

    p {
      margin: 0;
    }

    :global(.bx--snippet) {
      max-width: 100%;
    }
  }

  .projection-definition-epsg {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .projection-definition-label {
    color: var(--cds-text-secondary, #525252);
    font-size: var(--cds-label-01-font-size, 0.75rem);
  }

  .projection-definition-note {
    color: var(--cds-text-secondary, #525252);
    font-size: 0.75rem;
    line-height: 1rem;
  }

  .projection-current-name {
    overflow: hidden;
    color: var(--cds-text-primary, #161616);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
