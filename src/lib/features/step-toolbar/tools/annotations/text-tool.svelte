<script lang="ts">
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
  import { TextAlign } from '$lib/features/commons/types/enums';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    Column,
    Grid,
    NumberInput,
    Row,
    Select,
    SelectItem,
    Slider,
    TextArea
  } from 'carbon-components-svelte';
  import {
    Add,
    TextAlignCenter,
    TextAlignLeft,
    TextAlignRight,
    TrashCan
  } from 'carbon-icons-svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from './annotations.store.svelte';

  const annotationsState = $derived(getAnnotationsState());
  const defaultStyle = $derived(annotationsState.defaultStyle);

  const predefinedStyles = [
    { value: 'note', text: m.annotations_note() },
    { value: 'title', text: m.annotations_style_title() },
    { value: 'subtitle', text: m.annotations_style_subtitle() },
    { value: 'caption', text: m.annotations_style_caption() }
  ];

  function handleAddText() {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, '');
  }

  function handleFontSizeChange(e: CustomEvent<number | string | null>) {
    const detail = e.detail;
    const value =
      typeof detail === 'string' ? parseInt(detail, 10) : (detail ?? 0);
    if (!isNaN(value)) {
      annotationsActions.updateDefaultStyle({ fontSize: value });
    }
  }

  function handleAlignChange(align: TextAlign) {
    annotationsActions.setTextAlign(align);
  }

  const selectedText = $derived.by(() => {
    const selId = annotationsState.selectedId;
    if (!selId) return null;
    const item = annotationsState.items.find((i) => i.id === selId);
    return item && item.type === AnnotationKind.TEXT ? item : null;
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
    annotationsActions.updateDefaultStyle({ opacity: e.detail });
  }

  function handleBoldChange(checked: boolean) {
    annotationsActions.updateDefaultStyle({ bold: checked });
  }

  function handleItalicChange(checked: boolean) {
    annotationsActions.updateDefaultStyle({ italic: checked });
  }

  function handleUnderlineChange(checked: boolean) {
    annotationsActions.updateDefaultStyle({ underlined: checked });
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
        labelText={m.annotations_predefined_style()}
        selected={annotationsState.predefinedStyle || 'note'}
        on:change={(e) =>
          annotationsActions.setPredefinedStyle(
            (e.currentTarget as HTMLSelectElement).value
          )}
      >
        {#each predefinedStyles as style (style.value)}
          <SelectItem value={style.value} text={style.text} />
        {/each}
      </Select>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <p class="helper">{m.annotations_add_text_description()}</p>
        <TextArea
          id="text-content"
          labelText={m.annotations_content()}
          value={selectedText
            ? (selectedText.content as string)
            : annotationsState.textContent}
          on:input={handleContentInput}
          placeholder={selectedText ? '' : m.annotations_no_content()}
          disabled={!selectedText}
          rows={4}
        />
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <Button
          kind="primary"
          icon={Add}
          onclick={handleAddText}
          disabled={false}
        >
          {m.annotations_add_text()}
        </Button>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <NumberInput
          labelText={m.annotations_size()}
          value={defaultStyle.fontSize || 16}
          min={8}
          max={72}
          step={1}
          on:change={handleFontSizeChange}
        />
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <Slider
          labelText={m.annotations_opacity()}
          value={toOpacityPercent(defaultStyle.opacity)}
          min={0}
          max={100}
          step={5}
          stepMultiplier={4}
          on:change={handleOpacityChange}
        />
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section text-style-controls">
        <div class="style-toggles">
          <Switch
            labelText={m.annotations_bold()}
            toggled={defaultStyle.bold || false}
            labelA={m.no()}
            labelB={m.yes()}
            showStateLabel
            onchange={handleBoldChange}
          />

          <Switch
            labelText={m.annotations_italic()}
            toggled={defaultStyle.italic || false}
            labelA={m.no()}
            labelB={m.yes()}
            showStateLabel
            onchange={handleItalicChange}
          />

          <Switch
            labelText={m.annotations_underline()}
            toggled={defaultStyle.underlined || false}
            labelA={m.no()}
            labelB={m.yes()}
            showStateLabel
            onchange={handleUnderlineChange}
          />
        </div>

        <div class="alignment-controls">
          <p class="alignment-label">{m.annotations_alignment_label()}</p>
          <div class="alignment-buttons">
            <button
              class="alignment-btn {defaultStyle.textAlign === TextAlign.Left
                ? 'active'
                : ''}"
              onclick={() => handleAlignChange(TextAlign.Left)}
              aria-label={m.annotations_align_left()}
            >
              <TextAlignLeft />
            </button>
            <button
              class="alignment-btn {defaultStyle.textAlign === TextAlign.Center
                ? 'active'
                : ''}"
              onclick={() => handleAlignChange(TextAlign.Center)}
              aria-label={m.annotations_align_center()}
            >
              <TextAlignCenter />
            </button>
            <button
              class="alignment-btn {defaultStyle.textAlign === TextAlign.Right
                ? 'active'
                : ''}"
              onclick={() => handleAlignChange(TextAlign.Right)}
              aria-label={m.annotations_align_right()}
            >
              <TextAlignRight />
            </button>
          </div>
        </div>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <Button
          kind="danger-tertiary"
          icon={TrashCan}
          disabled={!selectedText}
          on:click={() =>
            selectedText &&
            annotationsActions.removeAnnotation(selectedText.id)}
        >
          {m.annotations_delete_text()}
        </Button>
      </div>
    </Column>
  </Row>
</Grid>

<style>
  .section {
    margin-top: var(--cds-spacing-05);
  }

  .text-style-controls {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .helper {
    margin: 0 0 var(--cds-spacing-03) 0;
    color: var(--cds-text-secondary);
    font-size: 0.875rem;
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

  .alignment-buttons {
    display: flex;
    gap: 2px;
    background: var(--cds-layer-01);
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    padding: 2px;
    width: fit-content;
  }

  .alignment-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 10px;
    background: transparent;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    color: var(--cds-text-secondary);
    transition: all 0.15s ease;
  }

  .alignment-btn:hover {
    background: var(--cds-layer-hover);
    color: var(--cds-text-primary);
  }

  .alignment-btn.active {
    background: var(--cds-button-primary);
    color: var(--cds-text-on-color);
  }

  .alignment-btn.active:hover {
    background: var(--cds-button-primary-hover);
  }
</style>
