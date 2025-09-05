<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    ButtonSet,
    Column,
    Grid,
    NumberInput,
    Row,
    Select,
    SelectItem,
    Slider,
    TextArea,
    Toggle
  } from 'carbon-components-svelte';
  import {
    Add,
    TextAlignCenter,
    TextAlignLeft,
    TextAlignRight,
    TextBold,
    TextItalic,
    TextUnderline,
    TrashCan
  } from 'carbon-icons-svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from './annotations.store.svelte';

  const annotationsState = $derived(getAnnotationsState());
  const defaultStyle = $derived(annotationsState.defaultStyle);

  const TextAlign = {
    LEFT: 'left',
    CENTER: 'center',
    RIGHT: 'right'
  } as const;

  const predefinedStyles = [
    { value: 'note', text: m.annotations_note() },
    { value: 'title', text: 'Titre' },
    { value: 'subtitle', text: 'Sous-titre' },
    { value: 'caption', text: 'Légende' }
  ];

  function handleAddText() {
    annotationsActions.addAnnotation('text', '');
  }

  function handleFontSizeChange(e: any) {
    const value =
      typeof e?.detail === 'string' ? parseInt(e.detail) : (e?.detail ?? 0);
    if (!isNaN(value)) {
      annotationsActions.updateDefaultStyle({ fontSize: value });
    }
  }

  function handleAlignChange(align: string) {
    annotationsActions.setTextAlign(align as any);
  }

  const selectedText = $derived.by(() => {
    const selId = annotationsState.selectedId;
    if (!selId) return null;
    const item = annotationsState.items.find((i) => i.id === selId);
    return item && item.type === 'text' ? item : null;
  });

  function handleContentInput(e: Event) {
    const value = (e.currentTarget as HTMLTextAreaElement).value;
    if (selectedText) {
      annotationsActions.updateAnnotation(selectedText.id, { content: value });
    } else {
      annotationsActions.setTextContent(value);
    }
  }

  function handleOpacityChange(e: CustomEvent<number>) {
    annotationsActions.updateDefaultStyle({ opacity: e.detail / 100 });
  }
</script>

<Grid padding noGutter>
  <Row>
    <Column>
      <Select
        labelText={m.annotations_predefined_style()}
        selected={annotationsState.predefinedStyle || 'note'}
        on:change={(e) =>
          annotationsActions.setPredefinedStyle(
            (e.currentTarget as HTMLSelectElement).value
          )}
      >
        {#each predefinedStyles as style}
          <SelectItem value={style.value} text={style.text} />
        {/each}
      </Select>
    </Column>
  </Row>

  <Row>
    <Column>
      <p class="helper">
        Ajouter un texte ou sélectionner un élément existant pour le modifier
        ci-dessous.
      </p>
      <TextArea
        id="text-content"
        labelText="Contenu"
        value={selectedText
          ? (selectedText.content as string)
          : annotationsState.textContent}
        oninput={handleContentInput}
        placeholder={selectedText ? '' : 'Aucune'}
        disabled={!selectedText}
        rows={4}
      />
    </Column>
  </Row>

  <Row>
    <Column>
      <Button
        kind="primary"
        icon={Add}
        onclick={handleAddText}
        disabled={false}
      >
        {m.annotations_add_text()}
      </Button>
    </Column>
  </Row>

  <Row>
    <Column>
      <NumberInput
        label={m.annotations_size()}
        value={defaultStyle.fontSize || 16}
        min={8}
        max={72}
        step={1}
        on:change={handleFontSizeChange}
      />
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="opacity-row">
        <Slider
          labelText={m.annotations_opacity?.() || 'Opacité'}
          value={(defaultStyle.opacity ?? 1) * 100}
          min={0}
          max={100}
          step={5}
          stepMultiplier={4}
          on:change={handleOpacityChange}
        />
        <div class="opacity-value">
          {Math.round((defaultStyle.opacity ?? 1) * 100)}
        </div>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="text-style-controls">
        <div class="style-toggles">
          <Toggle
            size="sm"
            labelText="Gras"
            toggled={defaultStyle.bold || false}
            ontoggle={() => annotationsActions.toggleStyleProperty('bold')}
          >
            <span slot="labelA"><TextBold /></span>
            <span slot="labelB"><TextBold /></span>
          </Toggle>

          <Toggle
            size="sm"
            labelText="Italique"
            toggled={defaultStyle.italic || false}
            ontoggle={() => annotationsActions.toggleStyleProperty('italic')}
          >
            <span slot="labelA"><TextItalic /></span>
            <span slot="labelB"><TextItalic /></span>
          </Toggle>

          <Toggle
            size="sm"
            labelText="Souligné"
            toggled={defaultStyle.underlined || false}
            ontoggle={() =>
              annotationsActions.toggleStyleProperty('underlined')}
          >
            <span slot="labelA"><TextUnderline /></span>
            <span slot="labelB"><TextUnderline /></span>
          </Toggle>
        </div>

        <div class="alignment-controls">
          <p class="alignment-label">Alignement</p>
          <ButtonSet>
            <Button
              kind={defaultStyle.textAlign === TextAlign.LEFT
                ? 'primary'
                : 'ghost'}
              size="small"
              icon={TextAlignLeft}
              iconDescription="Aligner à gauche"
              onclick={() => handleAlignChange(TextAlign.LEFT)}
            />
            <Button
              kind={defaultStyle.textAlign === TextAlign.CENTER
                ? 'primary'
                : 'ghost'}
              size="small"
              icon={TextAlignCenter}
              iconDescription="Centrer"
              onclick={() => handleAlignChange(TextAlign.CENTER)}
            />
            <Button
              kind={defaultStyle.textAlign === TextAlign.RIGHT
                ? 'primary'
                : 'ghost'}
              size="small"
              icon={TextAlignRight}
              iconDescription="Aligner à droite"
              onclick={() => handleAlignChange(TextAlign.RIGHT)}
            />
          </ButtonSet>
        </div>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <Button
        kind="danger-tertiary"
        icon={TrashCan}
        disabled={!selectedText}
        on:click={() =>
          selectedText && annotationsActions.removeAnnotation(selectedText.id)}
      >
        Supprimer le texte
      </Button>
    </Column>
  </Row>
</Grid>

<style>
  .text-style-controls {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    margin-top: var(--cds-spacing-05);
  }

  .helper {
    margin: 0 0 var(--cds-spacing-03) 0;
    color: var(--cds-text-secondary);
  }

  .style-toggles {
    display: flex;
    gap: var(--cds-spacing-05);
    flex-wrap: wrap;
  }

  .alignment-controls {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .alignment-label {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    margin: 0;
  }

  .opacity-row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: var(--cds-spacing-03);
  }
  .opacity-value {
    width: 48px;
    text-align: right;
    color: var(--cds-text-secondary);
  }
</style>
