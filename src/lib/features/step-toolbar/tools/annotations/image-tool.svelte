<script lang="ts">
  import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    Column,
    FileUploader,
    Grid,
    Row,
    Slider
  } from 'carbon-components-svelte';
  import { TrashCan, Upload } from 'carbon-icons-svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from './annotations.store.svelte';

  const annotationsState = $derived(getAnnotationsState());
  const defaultStyle = $derived(annotationsState.defaultStyle);

  const selectedImageAnnotation = $derived.by(() => {
    const selId = annotationsState.selectedId;
    if (!selId) return null;
    const item = annotationsState.items.find((i) => i.id === selId);
    return item && item.type === AnnotationKind.IMAGE ? item : null;
  });

  const effectiveStyle = $derived(
    selectedImageAnnotation?.style ?? defaultStyle
  );

  let hiddenUploader: HTMLDivElement | null = null;

  function triggerFileDialog() {
    if (hiddenUploader && hiddenUploader?.focus) {
      hiddenUploader.focus();
    }
    const input: HTMLInputElement | null =
      hiddenUploader?.querySelector?.('input[type="file"]') ?? null;
    input?.click?.();
  }

  function handleFileUpload(e: CustomEvent<readonly File[]>) {
    const files: readonly File[] = e.detail || [];
    if (files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        annotationsActions.addAnnotation(AnnotationKind.IMAGE, dataUrl);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleSizeChange(e: CustomEvent<number>) {
    annotationsActions.applyStyle({ size: e.detail });
  }
  function handleOpacityChange(e: CustomEvent<number>) {
    annotationsActions.applyStyle({ opacity: e.detail });
  }

  function toOpacityPercent(value: number | undefined): number {
    if (value === undefined) {
      return 100;
    }
    return value <= 1 ? value * 100 : value;
  }
</script>

<Grid noGutter fullWidth>
  <Row>
    <Column>
      <Button kind="primary" icon={Upload} onclick={triggerFileDialog}>
        {m.annotations_import_image()}
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
          value={effectiveStyle.size || 100}
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
          labelText={m.annotations_opacity()}
          value={toOpacityPercent(effectiveStyle.opacity)}
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
            disabled={!selected || selected.type !== AnnotationKind.IMAGE}
            onclick={() =>
              selected &&
              selected.type === AnnotationKind.IMAGE &&
              annotationsActions.removeAnnotation(selected.id)}
          >
            {m.annotations_delete_image()}
          </Button>
        {:else}
          <Button kind="danger-tertiary" icon={TrashCan} disabled>
            {m.annotations_delete_image()}
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
