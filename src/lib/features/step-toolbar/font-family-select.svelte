<script lang="ts">
  import {
    Select,
    SelectItem,
    SelectItemGroup
  } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    FONT_GROUPS,
    normalizeFontFamily,
    type AvailableFont,
    type FontCategory
  } from './fonts.constants';

  interface Props {
    value: string | null | undefined;
    fallback: AvailableFont;
    labelText: string;
    onchange: (font: AvailableFont) => void;
    id?: string;
    hideLabel?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'xl';
  }

  const {
    value,
    fallback,
    labelText,
    onchange,
    id,
    hideLabel = false,
    disabled = false,
    size = 'sm'
  }: Props = $props();

  const CATEGORY_LABELS: Record<FontCategory, () => string> = {
    sans: m.font_category_sans,
    condensed: m.font_category_condensed,
    serif: m.font_category_serif,
    slab: m.font_category_slab,
    handwritten: m.font_category_handwritten
  };

  const selected = $derived(normalizeFontFamily(value) ?? fallback);

  function handleChange(event: Event): void {
    const font = normalizeFontFamily(
      (event.currentTarget as HTMLSelectElement).value
    );
    if (font && font !== selected) onchange(font);
  }
</script>

<Select
  id={id}
  labelText={labelText}
  hideLabel={hideLabel}
  disabled={disabled}
  selected={selected}
  size={size}
  on:change={handleChange}
>
  {#each FONT_GROUPS as group (group.category)}
    <SelectItemGroup label={CATEGORY_LABELS[group.category]()}>
      {#each group.fonts as font (font)}
        <SelectItem value={font} text={font} />
      {/each}
    </SelectItemGroup>
  {/each}
</Select>
