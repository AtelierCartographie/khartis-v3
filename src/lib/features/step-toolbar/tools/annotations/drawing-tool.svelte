<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import {
    createColorValue,
    hexToHsl
  } from '$lib/features/commons/utils/color-utils';
  import {
    Button,
    Column,
    Grid,
    RadioButton,
    RadioButtonGroup,
    Row,
    Slider,
    Toggle
  } from 'carbon-components-svelte';
  import { Add, TrashCan } from 'carbon-icons-svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from './annotations.store.svelte';

  const annotationsState = $derived(getAnnotationsState());
  const defaultStyle = $derived(annotationsState.defaultStyle);

  let drawingType = $state<'line' | 'zone'>('line');
  let strokeColor = $state('#8d8d8d');
  let hue = $state(0);
  let saturation = $state(0);
  let lightness = $state(0);

  $effect(() => {
    if (defaultStyle.drawingType) drawingType = defaultStyle.drawingType;
    if (defaultStyle.strokeColor) {
      if (typeof defaultStyle.strokeColor === 'string') {
        strokeColor = defaultStyle.strokeColor as string;
        const hsl = hexToHsl(strokeColor);
        hue = hsl.hue;
        saturation = hsl.saturation;
        lightness = hsl.lightness;
      } else {
        const c = defaultStyle.strokeColor as any;
        hue = c.hue ?? 0;
        saturation = c.saturation ?? 0;
        lightness = c.lightness ?? 0;
        const cv = createColorValue('#000000', hue, saturation, lightness);
        strokeColor = cv.hex;
      }
    }
  });

  function handleStartDrawing() {
    annotationsActions.addAnnotation('drawing', drawingType);
  }

  function handleDrawingTypeChange(type: string) {
    drawingType = type as 'line' | 'zone';
    annotationsActions.updateDefaultStyle({
      drawingType: type as 'line' | 'zone'
    });
  }

  function handleThicknessChange(e: CustomEvent<number>) {
    annotationsActions.updateDefaultStyle({ strokeWidth: e.detail });
  }

  function handleSmoothnessChange(e: CustomEvent<number>) {
    annotationsActions.updateDefaultStyle({ smoothness: e.detail });
  }

  function handleColorChange(color: string) {
    strokeColor = color;
    const hsl = hexToHsl(color);
    hue = hsl.hue;
    saturation = hsl.saturation;
    lightness = hsl.lightness;
    annotationsActions.updateDefaultStyle({ strokeColor: color });
  }
</script>

<Grid padding noGutter>
  <Row>
    <Column>
      <p class="field-label">Type</p>
      <RadioButtonGroup
        selected={drawingType}
        on:change={(e) => handleDrawingTypeChange(String((e as any).detail))}
      >
        <RadioButton labelText="Ligne" value="line" />
        <RadioButton labelText="Zone" value="zone" />
      </RadioButtonGroup>
    </Column>
  </Row>

  <Row>
    <Column>
      <Button kind="primary" icon={Add} onclick={handleStartDrawing}>
        Ajouter un dessin
      </Button>
    </Column>
  </Row>

  <Row>
    <Column>
      <p class="helper">
        Ajouter un dessin ou sélectionner un élément existant pour le modifier
        ci-dessous.
      </p>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="metric-row">
        <Slider
          labelText="Épaisseur"
          value={defaultStyle.strokeWidth || 2}
          min={1}
          max={10}
          step={1}
          stepMultiplier={1}
          on:change={handleThicknessChange}
        />
        <div class="metric-value">{defaultStyle.strokeWidth ?? 2}</div>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="metric-row">
        <Slider
          labelText="Lissage (%)"
          value={defaultStyle.smoothness ?? 50}
          min={0}
          max={100}
          step={1}
          stepMultiplier={5}
          on:change={handleSmoothnessChange}
        />
        <div class="metric-value">{defaultStyle.smoothness ?? 50}</div>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="toggle-row">
        <span class="toggle-label">Pointillés</span>
        <Toggle
          size="sm"
          toggled={defaultStyle.strokeStyle === 'dotted'}
          ontoggle={(e) =>
            annotationsActions.updateDefaultStyle({
              strokeStyle: ((e as any).detail ? 'dotted' : 'solid') as
                | 'dotted'
                | 'solid'
            })}
        >
          <span slot="labelA">Oui</span>
          <span slot="labelB">Non</span>
        </Toggle>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <ColorPicker
        hex={strokeColor}
        hue={hue}
        saturation={saturation}
        lightness={lightness}
        triggerLabel="Couleur"
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
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="metric-row">
        <Slider
          labelText="Opacité"
          value={(defaultStyle.opacity ?? 1) * 100}
          min={0}
          max={100}
          step={5}
          stepMultiplier={5}
          on:change={(e) =>
            annotationsActions.updateDefaultStyle({ opacity: e.detail / 100 })}
        />
        <div class="metric-value">
          {Math.round((defaultStyle.opacity ?? 1) * 100)}
        </div>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      {#if annotationsState.selectedId}
        {@const selected = annotationsState.items.find(
          (i) => i.id === annotationsState.selectedId
        )}
        <Button
          kind="danger-tertiary"
          icon={TrashCan}
          disabled={!selected || selected.type !== 'drawing'}
          on:click={() =>
            selected &&
            selected.type === 'drawing' &&
            annotationsActions.removeAnnotation(selected.id)}
        >
          Supprimer le dessin
        </Button>
      {:else}
        <Button kind="danger-tertiary" icon={TrashCan} disabled
          >Supprimer le dessin</Button
        >
      {/if}
    </Column>
  </Row>
</Grid>

<style>
  .field-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--cds-text-01);
  }
  .helper {
    margin: 0 0 var(--cds-spacing-05) 0;
    color: var(--cds-text-secondary);
  }
  .metric-row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: var(--cds-spacing-03);
  }
  .metric-value {
    width: 48px;
    text-align: right;
    color: var(--cds-text-secondary);
  }
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .toggle-label {
    color: var(--cds-text-secondary);
  }
</style>
