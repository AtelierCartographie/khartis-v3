<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import type { DatasetAttachment } from '$lib/features/commons/types/create-project.types';
  import MainToolBarHeader from '$lib/features/main-toolbar/components/main-toolbar-header.svelte';
  import * as m from '$lib/paraglide/messages';
  import { ArrowRight, Link } from 'carbon-icons-svelte';

  interface Props {
    attachment: DatasetAttachment;
    /** The enriched dataset, absent while its file is still loading. */
    geoDatasetId: string | undefined;
    onOpenGeoDataset: (datasetId: string) => void;
  }

  let { attachment, geoDatasetId, onOpenGeoDataset }: Props = $props();
</script>

<section id="attached-table-step">
  <MainToolBarHeader
    title={m.attached_table_step_title()}
    icon={Link}
    showDivider
  />

  <div class="step-content">
    <p class="kh-help">
      {m.attached_table_step_description({ name: attachment.datasetName })}
    </p>
    <p class="kh-help">
      {m.attached_table_step_detach({ name: attachment.datasetName })}
    </p>
    {#if geoDatasetId}
      <Button
        kind="primary"
        size="field"
        icon={ArrowRight}
        on:click={() => onOpenGeoDataset(geoDatasetId)}
      >
        {m.attached_table_step_open({ name: attachment.datasetName })}
      </Button>
    {/if}
  </div>
</section>

<style>
  #attached-table-step {
    display: flex;
    flex-direction: column;
  }

  .step-content {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--kh-gap-param);
    padding: var(--kh-pad-panel);
  }

  .kh-help {
    margin: 0;
  }
</style>
