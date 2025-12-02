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
    Row,
    Select,
    SelectItem,
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
    { value: 'arrow', text: 'Flèche' },
    { value: 'rectangle', text: 'Rectangle' },
    { value: 'circle', text: 'Cercle' },
    { value: 'triangle', text: 'Triangle' },
    { value: 'star', text: 'Étoile' }
  ];

  let selectedShape = $state('arrow');
  let strokeColor = $state('#8d8d8d');
  let hue = $state(0);
  let saturation = $state(0);
  let lightness = $state(0);

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
        const cv = createColorValue('#000000', hue, saturation, lightness);
        strokeColor = cv.hex;
      }
    }
  });

  function handleAddShape() {
    annotationsActions.addAnnotation('shape', selectedShape);
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
</script>

<Grid noGutter fullWidth>
  <Row>
    <Column>
      <Select
        labelText="Forme"
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
        <p class="helper">
          Ajouter une forme ou sélectionner un élément existant pour le modifier
          ci-dessous.
        </p>
        <Button kind="primary" icon={Add} on:click={handleAddShape}>
          Ajouter une forme
        </Button>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <Slider
          labelText="Épaisseur"
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
          labelText="Courbe (%)"
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
          <span class="toggle-label">Pointillés</span>
          <Toggle
            size="sm"
            toggled={defaultStyle.strokeStyle === 'dotted'}
            ontoggle={(e: CustomEvent) => toggleDotted(e.detail ?? true)}
          >
            <span slot="labelA">Oui</span>
            <span slot="labelB">Non</span>
          </Toggle>
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
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
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
            disabled={!selected || selected.type !== 'shape'}
            on:click={() =>
              selected &&
              selected.type === 'shape' &&
              annotationsActions.removeAnnotation(selected.id)}
          >
            Supprimer la forme
          </Button>
        {:else}
          <Button kind="danger-tertiary" icon={TrashCan} disabled
            >Supprimer la forme</Button
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
