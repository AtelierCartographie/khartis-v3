<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import {
    AnnotationKind,
    DrawingType
  } from '$lib/features/commons/constants/ui.constants';
  import {
    createColorValue,
    hexToHsl
  } from '$lib/features/commons/utils/color-utils';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    Column,
    Grid,
    RadioButton,
    RadioButtonGroup,
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

  const selectedDrawing = $derived.by(() => {
    const selId = annotationsState.selectedId;
    if (!selId) return null;
    const item = annotationsState.items.find((i) => i.id === selId);
    return item && item.type === AnnotationKind.DRAWING ? item : null;
  });

  const effectiveStyle = $derived(selectedDrawing?.style ?? defaultStyle);

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

  let drawingType = $state<DrawingType>(DrawingType.LINE);
  let strokeColor = $state('#ffffff');
  let hue = $state(0);
  let saturation = $state(0);
  let lightness = $state(100);

  let fillColor = $state('#ffffff');
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

  function handleStartDrawing() {
    annotationsActions.addAnnotation(AnnotationKind.DRAWING, drawingType);
  }

  function handleDrawingTypeChange(event: CustomEvent<string | number>) {
    const type = String(event.detail) as DrawingType;
    drawingType = type;
    annotationsActions.applyStyle({
      drawingType: type
    });
  }

  function handleThicknessChange(e: CustomEvent<number>) {
    annotationsActions.applyStyle({ strokeWidth: e.detail });
  }

  function handleSmoothnessChange(e: CustomEvent<number>) {
    annotationsActions.applyStyle({ smoothness: e.detail });
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
      <RadioButtonGroup
        legendText={m.annotations_type()}
        selected={drawingType}
        on:change={handleDrawingTypeChange}
      >
        <RadioButton
          labelText={m.annotations_drawing_line()}
          value={DrawingType.LINE}
        />
        <RadioButton
          labelText={m.annotations_drawing_area()}
          value={DrawingType.ZONE}
        />
      </RadioButtonGroup>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <Button kind="primary" icon={Add} onclick={handleStartDrawing}>
          {m.annotations_add_drawing()}
        </Button>
        <p class="helper">{m.annotations_drawing_helper()}</p>
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

  <Row>
    <Column>
      <div class="section">
        <Slider
          labelText={m.annotations_smoothness()}
          value={effectiveStyle.smoothness ?? 50}
          min={0}
          max={100}
          step={1}
          stepMultiplier={5}
          on:change={handleSmoothnessChange}
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
            toggled={effectiveStyle.strokeStyle === 'dotted'}
            labelText={m.dashed()}
            hideLabel
            labelA={m.no()}
            labelB={m.yes()}
            showStateLabel
            onchange={(checked) => {
              const nextStyle: 'dotted' | 'solid' = checked
                ? 'dotted'
                : 'solid';
              annotationsActions.applyStyle({
                strokeStyle: nextStyle
              });
            }}
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

  {#if drawingType === DrawingType.ZONE}
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
            disabled={!selected || selected.type !== AnnotationKind.DRAWING}
            onclick={() =>
              selected &&
              selected.type === AnnotationKind.DRAWING &&
              annotationsActions.removeAnnotation(selected.id)}
          >
            {m.annotations_delete_drawing()}
          </Button>
        {:else}
          <Button kind="danger-tertiary" icon={TrashCan} disabled
            >{m.annotations_delete_drawing()}</Button
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
