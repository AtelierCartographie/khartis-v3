<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
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

  const annotationsState = $derived(getAnnotationsState());
  const defaultStyle = $derived(annotationsState.defaultStyle);

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

  const shapes = [
    { value: 'arrow', text: m.annotations_shape_arrow() },
    { value: 'line', text: m.annotations_shape_line() },
    { value: 'rectangle', text: m.annotations_shape_rectangle() },
    { value: 'circle', text: m.annotations_shape_circle() },
    { value: 'triangle', text: m.triangle() }
  ];

  let selectedShape = $state('arrow');
  let strokeColor = $state('#ffffff');
  let hue = $state(0);
  let saturation = $state(0);
  let lightness = $state(100);

  $effect(() => {
    if (defaultStyle.strokeColor) {
      if (typeof defaultStyle.strokeColor === 'string') {
        strokeColor = defaultStyle.strokeColor as string;
        const hsl = hexToHsl(strokeColor);
        hue = hsl.hue;
        saturation = hsl.saturation;
        lightness = hsl.lightness;
      } else if (isStrokeColorDescriptor(defaultStyle.strokeColor)) {
        const c = defaultStyle.strokeColor;
        hue = c.hue ?? 0;
        saturation = c.saturation ?? 0;
        lightness = c.lightness ?? 0;
        const cv = createColorValue('#ffffff', hue, saturation, lightness);
        strokeColor = cv.hex;
      }
    }
  });

  function handleAddShape() {
    annotationsActions.addAnnotation(AnnotationKind.SHAPE, selectedShape);
  }

  function handleThicknessChange(e: CustomEvent<number>) {
    annotationsActions.updateDefaultStyle({ strokeWidth: e.detail });
  }

  function handleCurvatureChange(e: CustomEvent<number>) {
    annotationsActions.updateDefaultStyle({ curvature: e.detail });
  }

  function toggleDotted(on: boolean) {
    annotationsActions.updateDefaultStyle({
      strokeStyle: on ? 'dotted' : 'solid'
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
        on:change={(e) =>
          (selectedShape = (e.currentTarget as HTMLSelectElement).value)}
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
        <p class="helper">{m.annotations_shape_helper()}</p>
        <Button kind="primary" icon={Add} on:click={handleAddShape}>
          {m.annotations_add_shape()}
        </Button>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <Slider
          labelText={m.thickness()}
          value={defaultStyle.strokeWidth || 2}
          min={1}
          max={10}
          step={1}
          stepMultiplier={1}
          on:change={handleThicknessChange}
        />
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <Slider
          labelText={m.annotations_curvature()}
          value={defaultStyle.curvature ?? 40}
          min={0}
          max={100}
          step={1}
          stepMultiplier={5}
          on:change={handleCurvatureChange}
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
            toggled={defaultStyle.strokeStyle === 'dotted'}
            labelText={m.dashed()}
            hideLabel
            labelA={m.no()}
            labelB={m.yes()}
            showStateLabel
            onchange={toggleDotted}
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
            annotationsActions.updateDefaultStyle({
              strokeColor: hex,
              color: { hue, saturation, lightness }
            });
          }}
          onCancel={() => {}}
        />
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <Slider
          labelText={m.opacity()}
          value={toOpacityPercent(defaultStyle.opacity)}
          min={0}
          max={100}
          step={5}
          stepMultiplier={5}
          on:change={(e) =>
            annotationsActions.updateDefaultStyle({ opacity: e.detail })}
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
            on:click={() =>
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
    margin: 0 0 var(--cds-spacing-03) 0;
    color: var(--cds-text-secondary);
    font-size: 0.875rem;
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
