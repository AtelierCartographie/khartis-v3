<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import SimpleRadioGroup from '$lib/features/commons/components/simple-radio-group.svelte';
  import {
    SliderWithInput,
    ToggleWithLabel
  } from '$lib/features/commons/components/viz-controls';
  import {
    AnnotationKind,
    DrawingType
  } from '$lib/features/commons/constants/ui.constants';
  import {
    createColorValue,
    hexToHsl
  } from '$lib/features/commons/utils/color-utils';
  import * as m from '$lib/paraglide/messages';
  import { Add } from 'carbon-icons-svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from './annotations.store.svelte';
  import { useSelectedAnnotationByType } from './_shared/use-selected-annotation.svelte';
  import { getOrdinalAnnotationName } from './_shared/annotation-name';
  import AnnotationToolPanel from './_shared/annotation-tool-panel.svelte';
  import { drawingSmoothing } from './drawing-smoothing.svelte';
  import { onDestroy } from 'svelte';

  const drawingTypeOptions = $derived.by(() => [
    { value: DrawingType.LINE, labelText: m.annotations_drawing_line() },
    { value: DrawingType.ZONE, labelText: m.annotations_drawing_area() }
  ]);

  const annotationsState = $derived(getAnnotationsState());
  const defaultStyle = $derived(annotationsState.defaultStyle);

  const selectedAnnotation = useSelectedAnnotationByType(
    AnnotationKind.DRAWING
  );
  const selectedDrawing = $derived(selectedAnnotation.selected);

  const effectiveStyle = $derived(selectedDrawing?.style ?? defaultStyle);

  const selectedDrawingName = $derived(
    selectedDrawing
      ? getOrdinalAnnotationName(
          annotationsState.items,
          selectedDrawing,
          m.annotations_drawing(),
          (candidate) => candidate.type === AnnotationKind.DRAWING
        )
      : undefined
  );

  function deleteSelectedDrawing(): void {
    if (selectedDrawing) {
      annotationsActions.removeAnnotation(selectedDrawing.id);
    }
  }

  type StrokeColorDescriptor = {
    hue?: number;
    saturation?: number;
    lightness?: number;
  };

  function isStrokeColorDescriptor(
    value: unknown
  ): value is StrokeColorDescriptor {
    return (
      typeof value === 'object' &&
      value !== null &&
      ('hue' in value || 'saturation' in value || 'lightness' in value)
    );
  }

  const DEFAULT_DRAWING_STROKE_COLOR = '#000000';
  const DEFAULT_DRAWING_FILL_COLOR = '#ffffff';

  let drawingType = $state<DrawingType>(DrawingType.LINE);
  let strokeColor = $state(DEFAULT_DRAWING_STROKE_COLOR);
  let hue = $state(0);
  let saturation = $state(0);
  let lightness = $state(0);

  let fillColor = $state(DEFAULT_DRAWING_FILL_COLOR);
  let fillHue = $state(0);
  let fillSaturation = $state(0);
  let fillLightness = $state(100);

  $effect(() => {
    const style = effectiveStyle;
    if (style.drawingType) drawingType = style.drawingType;
    if (style.strokeColor) {
      if (typeof style.strokeColor === 'string') {
        strokeColor = style.strokeColor as string;
        const hsl = hexToHsl(strokeColor);
        hue = hsl.hue;
        saturation = hsl.saturation;
        lightness = hsl.lightness;
      } else if (isStrokeColorDescriptor(style.strokeColor)) {
        const c = style.strokeColor;
        hue = c.hue ?? 0;
        saturation = c.saturation ?? 0;
        lightness = c.lightness ?? 0;
        const cv = createColorValue(
          DEFAULT_DRAWING_STROKE_COLOR,
          hue,
          saturation,
          lightness
        );
        strokeColor = cv.hex;
      }
    }
    if (style.fillColor) {
      if (typeof style.fillColor === 'string') {
        fillColor = style.fillColor as string;
        const hsl = hexToHsl(fillColor);
        fillHue = hsl.hue;
        fillSaturation = hsl.saturation;
        fillLightness = hsl.lightness;
      } else if (isStrokeColorDescriptor(style.fillColor)) {
        const c = style.fillColor;
        fillHue = c.hue ?? 0;
        fillSaturation = c.saturation ?? 0;
        fillLightness = c.lightness ?? 100;
        const cv = createColorValue(
          DEFAULT_DRAWING_FILL_COLOR,
          fillHue,
          fillSaturation,
          fillLightness
        );
        fillColor = cv.hex;
      }
    }
  });

  function handleStartDrawing() {
    annotationsActions.beginDrawing(drawingType);
  }

  function handleDrawingTypeChange(type: DrawingType) {
    if (type === drawingType) return;
    drawingType = type;
    annotationsActions.updateDefaultStyle({
      drawingType: type
    });
  }

  const activeDrawingType = $derived(
    annotationsState.creationMode === 'drawing'
      ? annotationsState.drawingModeType
      : drawingType
  );
  const isDrawingCreationActive = $derived(
    annotationsState.creationMode === 'drawing'
  );
  const minimumPointsToFinish = $derived(
    activeDrawingType === DrawingType.ZONE ? 3 : 2
  );

  function toOpacityPercent(value: number | undefined): number {
    if (value === undefined) {
      return 100;
    }
    return value <= 1 ? value * 100 : value;
  }

  onDestroy(() => drawingSmoothing.reset());

  $effect(() => {
    const release = (): void => drawingSmoothing.pointerUp();
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  });
</script>

<AnnotationToolPanel
  help={m.annotations_drawing_help()}
  actionLabel={m.annotations_add_drawing()}
  actionIcon={Add}
  onaction={handleStartDrawing}
  instructions={m.annotations_drawing_helper()}
  actionOverride={isDrawingCreationActive ? drawingInProgress : undefined}
  selectionLabel={m.annotations_selected_drawing()}
  selectedName={selectedDrawingName}
  deleteLabel={m.annotations_delete_drawing()}
  ondelete={deleteSelectedDrawing}
>
  {#snippet creationOptions()}
    <SimpleRadioGroup
      name="drawing-type"
      legendText={m.annotations_type()}
      items={drawingTypeOptions}
      selected={activeDrawingType}
      disabled={!!selectedDrawing || isDrawingCreationActive}
      onchange={(value) => handleDrawingTypeChange(value)}
    />
  {/snippet}

  {#snippet properties()}
    <SliderWithInput
      label={m.thickness()}
      value={effectiveStyle.strokeWidth || 2}
      min={1}
      max={10}
      step={1}
      inputWidth="72px"
      onchange={(strokeWidth) => {
        if (effectiveStyle.strokeWidth === strokeWidth) return;
        annotationsActions.applyStyle({ strokeWidth });
      }}
    />

    <div
      class="smoothness-control"
      role="presentation"
      onpointerdown={(event: PointerEvent) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.bx--slider')
        ) {
          drawingSmoothing.pointerDown();
        }
      }}
    >
      <SliderWithInput
        label={m.annotations_smoothness()}
        value={effectiveStyle.smoothness ?? 0}
        min={0}
        max={100}
        step={1}
        inputWidth="72px"
        onchange={(smoothness) => {
          if ((effectiveStyle.smoothness ?? 0) === smoothness) return;
          drawingSmoothing.changed();
          annotationsActions.applyStyle({ smoothness });
        }}
      />
    </div>

    <ToggleWithLabel
      label={m.dashed()}
      toggled={effectiveStyle.strokeStyle === 'dashed'}
      ontoggle={(on) =>
        annotationsActions.applyStyle({ strokeStyle: on ? 'dashed' : 'solid' })}
    />

    <ColorPicker
      hex={strokeColor}
      hue={hue}
      saturation={saturation}
      lightness={lightness}
      triggerLabel={m.color()}
      onValidate={({
        hex,
        hue,
        saturation,
        lightness
      }: {
        hex: string;
        hue: number;
        saturation: number;
        lightness: number;
      }) => {
        strokeColor = hex;
        annotationsActions.applyStyle({
          strokeColor: hex,
          color: { hue, saturation, lightness }
        });
      }}
      onCancel={() => {}}
    />

    <SliderWithInput
      label={m.opacity()}
      value={toOpacityPercent(effectiveStyle.opacity)}
      min={0}
      max={100}
      step={5}
      inputWidth="72px"
      onchange={(opacity) => {
        if (toOpacityPercent(effectiveStyle.opacity) === opacity) return;
        annotationsActions.applyStyle({ opacity });
      }}
    />

    {#if activeDrawingType === DrawingType.ZONE}
      <ColorPicker
        hex={fillColor}
        hue={fillHue}
        saturation={fillSaturation}
        lightness={fillLightness}
        triggerLabel={m.annotations_fill_color()}
        onValidate={({
          hex,
          hue,
          saturation,
          lightness
        }: {
          hex: string;
          hue: number;
          saturation: number;
          lightness: number;
        }) => {
          fillColor = hex;
          annotationsActions.applyStyle({
            fillColor: { hue, saturation, lightness }
          });
        }}
        onCancel={() => {}}
      />
    {/if}
  {/snippet}
</AnnotationToolPanel>

{#snippet drawingInProgress()}
  <p class="kh-help">{m.annotations_drawing_instructions()}</p>
  <div class="drawing-mode-actions">
    <Button
      size="field"
      kind="primary"
      disabled={annotationsState.drawingInProgress.length <
        minimumPointsToFinish}
      onclick={() => annotationsActions.finishDrawing()}
    >
      {m.annotations_drawing_finish()}
    </Button>
    <Button
      size="field"
      kind="tertiary"
      onclick={() => annotationsActions.cancelDrawing()}
    >
      {m.button_cancel()}
    </Button>
  </div>
{/snippet}

<style>
  .drawing-mode-actions {
    display: flex;
    gap: var(--kh-gap-inline);
  }

  .drawing-mode-actions :global(.bx--btn) {
    flex: 1;
    max-width: 100%;
  }
</style>
