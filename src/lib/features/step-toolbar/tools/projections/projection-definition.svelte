<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { CodeSnippet } from 'carbon-components-svelte';
  import { formatValue } from '$lib/features/commons/utils/format.utils';
  import { getCurrentProjectionContext } from './projection-georeference.utils';
  import { getCrsCatalogVersion } from './crs-catalog.store.svelte';
  import {
    resolveCurrentProjectionDefinition,
    type ProjectionDefinitionNote
  } from './projection-definition.utils';

  const context = $derived.by(() => {
    // Names read from the PROJ database land asynchronously.
    void getCrsCatalogVersion();
    return getCurrentProjectionContext();
  });
  const definition = $derived(resolveCurrentProjectionDefinition(context));

  function describeNote(note: ProjectionDefinitionNote): string {
    switch (note) {
      case 'spherical':
        return m.projection_definition_note_spherical();
      case 'oblique':
        return m.projection_definition_note_oblique();
      case 'oblique-transformation':
        return m.projection_definition_note_oblique_transformation();
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

{#if definition}
  <section class="projection-definition">
    <h4 class="projection-definition-title">
      {m.projection_definition_toggle()}
    </h4>
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
  </section>
{/if}

<style lang="scss">
  .projection-definition {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);

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

  .projection-definition-title {
    margin: 0;
    font-size: var(--cds-heading-compact-01-font-size, 0.875rem);
    font-weight: 600;
    line-height: 1.125rem;
  }
</style>
