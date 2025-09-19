<script lang="ts">
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
</script>

<div id="khartis-annotations-tool">
  <Grid noGutter fullWidth>
    <Row>
      <Column>
        <div class="tool-picker">
          <Button
            kind={annotationsState.activeType === 'text'
              ? 'primary'
              : 'tertiary'}
            size="field"
            onclick={() => annotationsActions.setActiveType('text')}
          >
            {m.annotations_text()}
          </Button>
          <Button
            kind={annotationsState.activeType === 'shape'
              ? 'primary'
              : 'tertiary'}
            size="field"
            icon={Crop}
            onclick={() => annotationsActions.setActiveType('shape')}
          >
            {m.annotations_shape()}
          </Button>
          <Button
            kind={annotationsState.activeType === 'drawing'
              ? 'primary'
              : 'tertiary'}
            size="field"
            icon={Pen}
            onclick={() => annotationsActions.setActiveType('drawing')}
          >
            {m.annotations_drawing()}
          </Button>
          <Button
            kind={annotationsState.activeType === 'image'
              ? 'primary'
              : 'tertiary'}
            size="field"
            icon={Image}
            onclick={() => annotationsActions.setActiveType('image')}
          >
            {m.annotations_image()}
          </Button>
        </div>
      </Column>
    </Row>

    <Row>
      <Column>
        {#if annotationsState.activeType === 'text'}
          <TextTool />
        {:else if annotationsState.activeType === 'shape'}
          <ShapeTool />
        {:else if annotationsState.activeType === 'drawing'}
          <DrawingTool />
        {:else if annotationsState.activeType === 'image'}
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
</style>
