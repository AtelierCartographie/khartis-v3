<script lang="ts">
  import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import * as m from '$lib/paraglide/messages';
  import { Button, Column, Grid, Row } from 'carbon-components-svelte';
  import { Crop, Image, Pen } from 'carbon-icons-svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from './annotations.store.svelte';
  import DrawingTool from './drawing-tool.svelte';
  import ImageTool from './image-tool.svelte';
  import ShapeTool from './shape-tool.svelte';
  import TextTool from './text-tool.svelte';

  const annotationsState = $derived(getAnnotationsState());
  const annotationsVisible = $derived(annotationsState.visible);

  function handleVisibilityChange(visible: boolean): void {
    if (visible !== annotationsState.visible) {
      annotationsActions.setVisibility(visible);
    }
  }
</script>

<div id="khartis-annotations-tool">
  <Grid noGutter fullWidth>
    <Row>
      <Column>
        <div class="switch-row">
          <span class="switch-label">{m.tool_annotations()}</span>
          <Switch
            toggled={annotationsVisible}
            labelText={m.tool_annotations()}
            hideLabel
            labelA={m.layers_hide()}
            labelB={m.layers_show()}
            showStateLabel
            onchange={handleVisibilityChange}
          />
        </div>
      </Column>
    </Row>

    <Row>
      <Column>
        <div class="tool-picker">
          <Button
            kind={annotationsState.activeType === AnnotationKind.TEXT
              ? 'primary'
              : 'tertiary'}
            size="field"
            onclick={() =>
              annotationsActions.setActiveType(AnnotationKind.TEXT)}
          >
            {m.annotations_text()}
          </Button>
          <Button
            kind={annotationsState.activeType === AnnotationKind.SHAPE
              ? 'primary'
              : 'tertiary'}
            size="field"
            icon={Crop}
            onclick={() =>
              annotationsActions.setActiveType(AnnotationKind.SHAPE)}
          >
            {m.annotations_shape()}
          </Button>
          <Button
            kind={annotationsState.activeType === AnnotationKind.DRAWING
              ? 'primary'
              : 'tertiary'}
            size="field"
            icon={Pen}
            onclick={() =>
              annotationsActions.setActiveType(AnnotationKind.DRAWING)}
          >
            {m.annotations_drawing()}
          </Button>
          <Button
            kind={annotationsState.activeType === AnnotationKind.IMAGE
              ? 'primary'
              : 'tertiary'}
            size="field"
            icon={Image}
            onclick={() =>
              annotationsActions.setActiveType(AnnotationKind.IMAGE)}
          >
            {m.annotations_image()}
          </Button>
        </div>
      </Column>
    </Row>

    <Row>
      <Column>
        {#if annotationsState.activeType === AnnotationKind.TEXT}
          <TextTool />
        {:else if annotationsState.activeType === AnnotationKind.SHAPE}
          <ShapeTool />
        {:else if annotationsState.activeType === AnnotationKind.DRAWING}
          <DrawingTool />
        {:else if annotationsState.activeType === AnnotationKind.IMAGE}
          <ImageTool />
        {/if}
      </Column>
    </Row>
  </Grid>
</div>

<style lang="scss">
  #khartis-annotations-tool :global(.bx--number input[type='number']) {
    min-width: 0 !important;
  }

  .tool-picker {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--cds-spacing-03);
    margin-bottom: var(--cds-spacing-06);
  }

  .switch-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-02) 0 var(--cds-spacing-04) 0;
  }

  .switch-label {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    font-weight: 400;
  }
</style>
