<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    Column,
    FileUploader,
    Grid,
    Row,
    Slider
  } from 'carbon-components-svelte';
  import { Add, TrashCan } from 'carbon-icons-svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from './annotations.store.svelte';

  const annotationsState = $derived(getAnnotationsState());
  const defaultStyle = $derived(annotationsState.defaultStyle);

  let hiddenUploader: any;

  function triggerFileDialog() {
    if (hiddenUploader && hiddenUploader?.focus) {
      hiddenUploader.focus();
    }
    const input: HTMLInputElement | null = (
      hiddenUploader as any
    )?.querySelector?.('input[type="file"]');
    input?.click?.();
  }

  function handleFileUpload(e: any) {
    const files: readonly File[] = e?.detail || [];
    if (files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        annotationsActions.addAnnotation('image', dataUrl);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleSizeChange(e: CustomEvent<number>) {
    annotationsActions.updateDefaultStyle({ size: e.detail });
  }
  function handleOpacityChange(e: CustomEvent<number>) {
    annotationsActions.updateDefaultStyle({ opacity: e.detail / 100 });
  }
</script>

<Grid noGutter fullWidth>
  <Row>
    <Column>
      <Button kind="primary" icon={Add} on:click={triggerFileDialog}>
        Importer une image
      </Button>
      <div class="visually-hidden" bind:this={hiddenUploader}>
        <FileUploader
          labelTitle=""
          buttonLabel=""
          status="edit"
          accept={['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp']}
          multiple={false}
          on:change={handleFileUpload}
        />
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <Slider
          labelText={m.annotations_size()}
          value={defaultStyle.size || 100}
          min={1}
          max={100}
          step={1}
          stepMultiplier={5}
          on:change={handleSizeChange}
        />
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <Slider
          labelText={m.annotations_opacity?.() || 'Opacité'}
          value={(defaultStyle.opacity ?? 1) * 100}
          min={0}
          max={100}
          step={5}
          stepMultiplier={5}
          on:change={handleOpacityChange}
        />
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        {#if annotationsState.selectedId}
          {@const selected = annotationsState.items.find(
            (i) => i.id === annotationsState.selectedId
          )}
          <Button
            kind="danger-tertiary"
            icon={TrashCan}
            disabled={!selected || selected.type !== 'image'}
            on:click={() =>
              selected &&
              selected.type === 'image' &&
              annotationsActions.removeAnnotation(selected.id)}
          >
            Supprimer l’image
          </Button>
        {:else}
          <Button kind="danger-tertiary" icon={TrashCan} disabled>
            Supprimer l’image
          </Button>
        {/if}
      </div>
    </Column>
  </Row>
</Grid>

<style>
  .section {
    margin-top: var(--cds-spacing-05);
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
</style>
