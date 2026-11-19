<script lang="ts">
  import { SliderWithInput } from '$lib/features/commons/components/viz-controls';
  import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
  import * as m from '$lib/paraglide/messages';
  import { FileUploader } from 'carbon-components-svelte';
  import { Upload } from 'carbon-icons-svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from './annotations.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import {
    isAnnotationImageFileSizeAllowed,
    isSupportedAnnotationImageFile,
    MAX_ANNOTATION_IMAGE_SIZE_BYTES,
    SUPPORTED_ANNOTATION_IMAGE_EXTENSIONS
  } from './image-file-validation';
  import { useSelectedAnnotationByType } from './_shared/use-selected-annotation.svelte';
  import { getOrdinalAnnotationName } from './_shared/annotation-name';
  import AnnotationToolPanel from './_shared/annotation-tool-panel.svelte';

  const annotationsState = $derived(getAnnotationsState());
  const defaultStyle = $derived(annotationsState.defaultStyle);

  const selectedAnnotation = useSelectedAnnotationByType(AnnotationKind.IMAGE);
  const selectedImageAnnotation = $derived(selectedAnnotation.selected);

  const effectiveStyle = $derived(
    selectedImageAnnotation?.style ?? defaultStyle
  );

  const selectedImageName = $derived(
    selectedImageAnnotation
      ? getOrdinalAnnotationName(
          annotationsState.items,
          selectedImageAnnotation,
          m.annotations_image(),
          (candidate) => candidate.type === AnnotationKind.IMAGE
        )
      : undefined
  );

  function deleteSelectedImage(): void {
    if (selectedImageAnnotation) {
      annotationsActions.removeAnnotation(selectedImageAnnotation.id);
    }
  }

  let hiddenUploader: HTMLDivElement | null = null;
  let imageImportError = $state<string | null>(null);

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
      if (!isSupportedAnnotationImageFile(file)) {
        imageImportError = m.annotations_image_unsupported_format();
        return;
      }

      if (!isAnnotationImageFileSizeAllowed(file)) {
        imageImportError = m.annotations_image_too_large({
          limit: String(
            Math.round(MAX_ANNOTATION_IMAGE_SIZE_BYTES / (1024 * 1024))
          )
        });
        return;
      }

      imageImportError = null;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        annotationsActions.beginPlacement(AnnotationKind.IMAGE, dataUrl);
      };
      reader.onerror = () => {
        logger.error('Failed to read annotation image file', LogCategory.UI, {
          fileName: file.name,
          error: reader.error
        });
        imageImportError = m.annotations_image_read_failed();
      };
      reader.readAsDataURL(file);
    }
  }

  function toOpacityPercent(value: number | undefined): number {
    if (value === undefined) {
      return 100;
    }
    return value <= 1 ? value * 100 : value;
  }
</script>

<div class="visually-hidden" bind:this={hiddenUploader}>
  <FileUploader
    iconDescription={m.remove_file_action()}
    labelTitle=""
    buttonLabel=""
    status="edit"
    accept={Array.from(SUPPORTED_ANNOTATION_IMAGE_EXTENSIONS)}
    multiple={false}
    on:change={handleFileUpload}
  />
</div>

<AnnotationToolPanel
  help={m.annotations_image_help()}
  actionLabel={m.annotations_import_image()}
  actionIcon={Upload}
  onaction={triggerFileDialog}
  error={imageImportError}
  selectionLabel={m.annotations_selected_image()}
  selectedName={selectedImageName}
  deleteLabel={m.annotations_delete_image()}
  ondelete={deleteSelectedImage}
>
  {#snippet properties()}
    <SliderWithInput
      label={m.annotations_size()}
      value={effectiveStyle.size || 200}
      min={10}
      max={1000}
      step={1}
      inputWidth="72px"
      showSteppers={false}
      onchange={(size) => {
        if ((effectiveStyle.size || 200) === size) return;
        annotationsActions.applyStyle({ size });
      }}
    />

    <SliderWithInput
      label={m.annotations_opacity()}
      value={toOpacityPercent(effectiveStyle.opacity)}
      min={0}
      max={100}
      step={5}
      inputWidth="72px"
      showSteppers={false}
      onchange={(opacity) => {
        if (toOpacityPercent(effectiveStyle.opacity) === opacity) return;
        annotationsActions.applyStyle({ opacity });
      }}
    />
  {/snippet}
</AnnotationToolPanel>

<style>
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
