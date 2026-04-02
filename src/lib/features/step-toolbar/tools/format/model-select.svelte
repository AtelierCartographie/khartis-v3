<script lang="ts">
  import { PageModel } from '$lib/features/commons/constants/ui.constants';
  import { m } from '$lib/paraglide/messages';
  import { Select, SelectItem } from 'carbon-components-svelte';
  import { formatActions, formatState } from './format.store.svelte';

  const selectedModel = $derived(formatState.model);

  const modelOptions = [
    { value: PageModel.A4_LANDSCAPE, text: m.format_model_a4_landscape() },
    { value: PageModel.A4_PORTRAIT, text: m.format_model_a4_portrait() },
    { value: PageModel.A3_LANDSCAPE, text: m.format_model_a3_landscape() },
    { value: PageModel.A3_PORTRAIT, text: m.format_model_a3_portrait() },
    {
      value: PageModel.SCREEN_LANDSCAPE,
      text: m.format_model_screen_landscape()
    },
    { value: PageModel.SCREEN_PORTRAIT, text: m.format_model_screen_portrait() }
  ];

  function handleModelChange(event: Event): void {
    const model = (event.target as HTMLSelectElement).value as PageModel;
    if (model && model !== formatState.model) {
      formatActions.setModel(model);
    }
  }
</script>

<Select
  selected={selectedModel}
  id="model-select"
  labelText={m.format_model()}
  size="sm"
  on:change={handleModelChange}
>
  {#each modelOptions as option (option.value)}
    <SelectItem value={option.value} text={option.text} />
  {/each}
</Select>
