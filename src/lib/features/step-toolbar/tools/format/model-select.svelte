<script lang="ts">
  import { PageModel } from '$lib/features/commons/constants/ui.constants';
  import { m } from '$lib/paraglide/messages';
  import {
    Column,
    Grid,
    Row,
    Select,
    SelectItem
  } from 'carbon-components-svelte';
  import { formatActions, getFormatState } from './format.store.svelte';

  const formatState = $derived(getFormatState());
  let selectedModel = $state<PageModel>(PageModel.A4_LANDSCAPE);

  const modelOptions = [
    { value: PageModel.A4_LANDSCAPE, text: m.format_model_a4_landscape() },
    { value: PageModel.A4_PORTRAIT, text: m.format_model_a4_portrait() },
    { value: PageModel.A3_LANDSCAPE, text: m.format_model_a3_landscape() },
    { value: PageModel.A3_PORTRAIT, text: m.format_model_a3_portrait() }
  ];

  $effect(() => {
    if (formatState.model && selectedModel !== formatState.model) {
      selectedModel = formatState.model;
    }
  });

  $effect(() => {
    if (selectedModel && selectedModel !== formatState.model) {
      formatActions.setModel(selectedModel);
    }
  });
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
        {#each modelOptions as option (option.value)}
          <SelectItem value={option.value} text={option.text} />
        {/each}
      </Select>
    </Column>
  </Row>
</Grid>
