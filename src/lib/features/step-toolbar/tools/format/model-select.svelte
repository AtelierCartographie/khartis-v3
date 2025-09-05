<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import {
    Column,
    Grid,
    Row,
    Select,
    SelectItem
  } from 'carbon-components-svelte';
  import { formatActions, formatState } from './format.store.svelte';

  let selectedModel = $state(formatState.model);

  const modelOptions = [
    { value: 'page-a4-landscape', text: m.format_model_a4_landscape() },
    { value: 'page-a4-portrait', text: m.format_model_a4_portrait() },
    { value: 'page-a3-landscape', text: m.format_model_a3_landscape() },
    { value: 'page-a3-portrait', text: m.format_model_a3_portrait() }
  ];

  $effect(() => formatActions.setModel(selectedModel));
</script>

<Grid padding noGutter>
  <Row>
    <Column>
      <Select
        bind:selected={selectedModel}
        id="model-select"
        labelText={m.format_model()}
        size="xl"
      >
        {#each modelOptions as option}
          <SelectItem value={option.value} text={option.text} />
        {/each}
      </Select>
    </Column>
  </Row>
</Grid>
