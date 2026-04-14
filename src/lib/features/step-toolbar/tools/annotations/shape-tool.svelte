<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
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
  import {
    Button,
    Column,
    Grid,
    Row,
    Select,
    SelectItem,
    Slider
  } from 'carbon-components-svelte';
  import { Add, TrashCan } from 'carbon-icons-svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from './annotations.store.svelte';
  import { useSelectedAnnotationByType } from './_shared/use-selected-annotation.svelte';

  const annotationsState = $derived(getAnnotationsState());
  const defaultStyle = $derived(annotationsState.defaultStyle);

  const selectedAnnotation = useSelectedAnnotationByType(AnnotationKind.SHAPE);
  const selectedShapeAnnotation = $derived(selectedAnnotation.selected);

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

  const shapes: { value: ShapeTypeValue; text: string }[] = [
    { value: SHAPE_TYPE.ARROW, text: m.annotations_shape_arrow() },
    { value: SHAPE_TYPE.LINE, text: m.annotations_shape_line() },
    { value: SHAPE_TYPE.RECTANGLE, text: m.annotations_shape_rectangle() },
    { value: SHAPE_TYPE.CIRCLE, text: m.annotations_shape_circle() },
    { value: SHAPE_TYPE.TRIANGLE, text: m.triangle() }
  ];

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

  $effect(() => {
    // Sync dropdown when user selects an existing shape annotation on the canvas
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
    }
  }

  function handleAddShape() {
    annotationsActions.addAnnotation(AnnotationKind.SHAPE, selectedShape);
  }

  function handleThicknessChange(e: CustomEvent<number>) {
    annotationsActions.applyStyle({ strokeWidth: e.detail });
  }

  function handleCurvatureChange(e: CustomEvent<number>) {
    annotationsActions.applyStyle({ curvature: e.detail });
  }

  function handleRotationChange(e: CustomEvent<number>) {
    annotationsActions.applyStyle({ rotation: e.detail });
  }

  function toggleDashed(on: boolean) {
    annotationsActions.applyStyle({
      strokeStyle: on ? 'dashed' : 'solid'
    });
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
      <Select
        labelText={m.shape()}
        selected={selectedShape}
        on:change={handleShapeChange}
      >
        {#each shapes as s (s.value)}
          <SelectItem value={s.value} text={s.text} />
        {/each}
      </Select>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <Button kind="primary" icon={Add} onclick={handleAddShape}>
          {m.annotations_add_shape()}
        </Button>
        <p class="helper">{m.annotations_shape_helper()}</p>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <Slider
          labelText={m.thickness()}
          value={effectiveStyle.strokeWidth || 2}
          min={1}
          max={10}
          step={1}
          stepMultiplier={1}
          on:change={handleThicknessChange}
          minLabel=""
          maxLabel=""
        />
      </div>
    </Column>
  </Row>

  {#if selectedShape === SHAPE_TYPE.ARROW}
    <Row>
      <Column>
        <div class="section">
          <Slider
            labelText={m.annotations_curvature()}
            value={effectiveStyle.curvature ?? 40}
            min={0}
            max={100}
            step={1}
            stepMultiplier={5}
            on:change={handleCurvatureChange}
            minLabel=""
            maxLabel=""
          />
        </div>
      </Column>
    </Row>
  {/if}

  <Row>
    <Column>
      <div class="section">
        <Slider
          labelText={m.annotations_rotation()}
          value={effectiveStyle.rotation ?? 0}
          min={0}
          max={359}
          step={1}
          stepMultiplier={15}
          on:change={handleRotationChange}
          minLabel=""
          maxLabel=""
        />
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <div class="toggle-row">
          <span class="toggle-label">{m.dashed()}</span>
          <Switch
            toggled={effectiveStyle.strokeStyle === 'dashed'}
            labelText={m.dashed()}
            hideLabel
            labelA={m.no()}
            labelB={m.yes()}
            showStateLabel
            onchange={toggleDashed}
          />
        </div>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
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
      </div>
    </Column>
  </Row>

  {#if FILLED_SHAPES.includes(selectedShape)}
    <Row>
      <Column>
        <div class="section">
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
        </div>
      </Column>
    </Row>
  {/if}

  <Row>
    <Column>
      <div class="section">
        <Slider
          labelText={m.opacity()}
          value={toOpacityPercent(effectiveStyle.opacity)}
          min={0}
          max={100}
          step={5}
          stepMultiplier={5}
          on:change={(e) =>
            annotationsActions.applyStyle({ opacity: e.detail })}
          minLabel=""
          maxLabel=""
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
            disabled={!selected || selected.type !== AnnotationKind.SHAPE}
            onclick={() =>
              selected &&
              selected.type === AnnotationKind.SHAPE &&
              annotationsActions.removeAnnotation(selected.id)}
          >
            {m.annotations_delete_shape()}
          </Button>
        {:else}
          <Button kind="danger-tertiary" icon={TrashCan} disabled
            >{m.annotations_delete_shape()}</Button
          >
        {/if}
      </div>
    </Column>
  </Row>
</Grid>

<style>
  .section {
    margin-top: var(--cds-spacing-05);
  }

  .helper {
    margin: var(--cds-spacing-03) 0 0 0;
    color: var(--cds-text-secondary);
    font-size: 0.75rem;
    line-height: 1rem;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .toggle-label {
    color: var(--cds-text-secondary);
    font-size: 0.875rem;
  }
</style>
