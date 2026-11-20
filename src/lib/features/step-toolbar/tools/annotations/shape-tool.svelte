<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import {
    SliderWithInput,
    ToggleWithLabel
  } from '$lib/features/commons/components/viz-controls';
  import {
    SHAPE_TYPE,
    SHAPE_TYPES,
    type ShapeTypeValue
  } from '$lib/features/commons/constants';
  import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
  import {
    createColorValue,
    hexToHsl
  } from '$lib/features/commons/utils/color-utils';
  import * as m from '$lib/paraglide/messages';
  import { Select, SelectItem } from 'carbon-components-svelte';
  import { Add } from 'carbon-icons-svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from './annotations.store.svelte';
  import { useSelectedAnnotationByType } from './_shared/use-selected-annotation.svelte';
  import { getOrdinalAnnotationName } from './_shared/annotation-name';
  import AnnotationToolPanel from './_shared/annotation-tool-panel.svelte';

  const annotationsState = $derived(getAnnotationsState());
  const defaultStyle = $derived(annotationsState.defaultStyle);

  const selectedAnnotation = useSelectedAnnotationByType(AnnotationKind.SHAPE);
  const selectedShapeAnnotation = $derived(selectedAnnotation.selected);
  const isShapePlacementActive = $derived(
    annotationsState.creationMode === 'placing' &&
      annotationsState.pendingType === AnnotationKind.SHAPE
  );

  const effectiveStyle = $derived(
    selectedShapeAnnotation?.style ?? defaultStyle
  );

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

  const shapes = $derived.by<{ value: ShapeTypeValue; text: string }[]>(() => [
    { value: SHAPE_TYPE.ARROW, text: m.annotations_shape_arrow() },
    { value: SHAPE_TYPE.LINE, text: m.annotations_shape_line() },
    { value: SHAPE_TYPE.RECTANGLE, text: m.annotations_shape_rectangle() },
    { value: SHAPE_TYPE.CIRCLE, text: m.annotations_shape_circle() },
    { value: SHAPE_TYPE.TRIANGLE, text: m.triangle() }
  ]);

  const selectedShapeName = $derived.by(() => {
    const item = selectedShapeAnnotation;
    if (!item) return undefined;
    const name =
      shapes.find((shape) => shape.value === item.content)?.text ??
      m.annotations_shape();
    return getOrdinalAnnotationName(
      annotationsState.items,
      item,
      name,
      (candidate) =>
        candidate.type === AnnotationKind.SHAPE &&
        candidate.content === item.content
    );
  });

  function deleteSelectedShape(): void {
    if (selectedShapeAnnotation) {
      annotationsActions.removeAnnotation(selectedShapeAnnotation.id);
    }
  }

  const FILLED_SHAPES: ShapeTypeValue[] = [
    SHAPE_TYPE.RECTANGLE,
    SHAPE_TYPE.CIRCLE,
    SHAPE_TYPE.TRIANGLE
  ];

  let selectedShape = $state<ShapeTypeValue>(SHAPE_TYPE.ARROW);
  let strokeColor = $state('#000000');
  let hue = $state(0);
  let saturation = $state(0);
  let lightness = $state(0);

  let fillColor = $state('#ffffff');
  let fillHue = $state(0);
  let fillSaturation = $state(0);
  let fillLightness = $state(100);

  const isVectorShape = $derived(
    selectedShape === SHAPE_TYPE.LINE || selectedShape === SHAPE_TYPE.ARROW
  );

  $effect(() => {
    if (selectedShapeAnnotation) {
      const content = String(selectedShapeAnnotation.content);
      if (SHAPE_TYPES.includes(content as ShapeTypeValue)) {
        selectedShape = content as ShapeTypeValue;
      }
    }

    const style = effectiveStyle;
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
        const cv = createColorValue('#ffffff', hue, saturation, lightness);
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
          '#ffffff',
          fillHue,
          fillSaturation,
          fillLightness
        );
        fillColor = cv.hex;
      }
    }
  });

  function handleShapeChange(e: Event) {
    const value = (e.currentTarget as HTMLSelectElement).value;
    if (SHAPE_TYPES.includes(value as ShapeTypeValue)) {
      selectedShape = value as ShapeTypeValue;
      if (isShapePlacementActive) {
        annotationsActions.beginPlacement(AnnotationKind.SHAPE, selectedShape);
      }
    }
  }

  function handleAddShape() {
    annotationsActions.beginPlacement(AnnotationKind.SHAPE, selectedShape);
  }

  function toOpacityPercent(value: number | undefined): number {
    if (value === undefined) {
      return 100;
    }
    return value <= 1 ? value * 100 : value;
  }
</script>

<AnnotationToolPanel
  help={m.annotations_shape_help()}
  actionLabel={m.annotations_add_shape()}
  actionIcon={Add}
  onaction={handleAddShape}
  instructions={m.annotations_shape_instructions()}
  selectionLabel={m.annotations_selected_shape()}
  selectedName={selectedShapeName}
  deleteLabel={m.annotations_delete_shape()}
  ondelete={deleteSelectedShape}
>
  {#snippet creationOptions()}
    <Select
      size="sm"
      labelText={m.shape()}
      selected={selectedShape}
      disabled={!!selectedShapeAnnotation}
      on:change={handleShapeChange}
    >
      {#each shapes as s (s.value)}
        <SelectItem value={s.value} text={s.text} />
      {/each}
    </Select>
  {/snippet}

  {#snippet properties()}
    <SliderWithInput
      label={m.thickness()}
      value={effectiveStyle.strokeWidth || 2}
      min={1}
      max={10}
      step={1}
      inputWidth="72px"
      showSteppers={false}
      onchange={(strokeWidth) => {
        if (effectiveStyle.strokeWidth === strokeWidth) return;
        annotationsActions.applyStyle({ strokeWidth });
      }}
    />

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
      showSteppers={false}
      onchange={(opacity) => {
        if (toOpacityPercent(effectiveStyle.opacity) === opacity) return;
        annotationsActions.applyStyle({ opacity });
      }}
    />

    {#if FILLED_SHAPES.includes(selectedShape)}
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

    {#if !isVectorShape}
      <SliderWithInput
        label={m.annotations_rotation()}
        value={effectiveStyle.rotation ?? 0}
        min={0}
        max={359}
        step={1}
        inputWidth="72px"
        showSteppers={false}
        onchange={(rotation) => {
          if ((effectiveStyle.rotation ?? 0) === rotation) return;
          annotationsActions.applyStyle({ rotation });
        }}
      />
    {/if}
  {/snippet}
</AnnotationToolPanel>
