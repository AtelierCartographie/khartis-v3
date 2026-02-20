<script lang="ts">
  import { ANNOTATION_ROLE } from '$lib/features/commons/constants';
  import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
  import { TextAlign } from '$lib/features/commons/types/enums';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    Column,
    Grid,
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

  const selectedText = $derived.by(() => {
    const selId = annotationsState.selectedId;
    if (!selId) return null;
    const item = annotationsState.items.find((i) => i.id === selId);
    return item && item.type === AnnotationKind.TEXT ? item : null;
  });

  const effectiveStyle = $derived(selectedText?.style ?? defaultStyle);

  const predefinedStyles = [
    { value: ANNOTATION_ROLE.NOTE, text: m.annotations_note() },
    { value: ANNOTATION_ROLE.TITLE, text: m.annotations_style_title() },
    { value: ANNOTATION_ROLE.SUBTITLE, text: m.annotations_style_subtitle() },
    { value: 'caption', text: m.annotations_style_caption() }
  ];

  function handleAlignChange(align: TextAlign) {
    annotationsActions.applyStyle({ textAlign: align });
  }

  const textEditorValue = $derived(
    selectedText
      ? String(selectedText.content ?? '')
      : annotationsState.textContent
  );
  const canAddText = $derived(textEditorValue.trim().length > 0);

  function handleAddText() {
    if (!canAddText) {
      return;
    }

    annotationsActions.addAnnotation(AnnotationKind.TEXT, textEditorValue);
  }

  function handleContentInput(e: Event) {
    const value = (e.currentTarget as HTMLTextAreaElement).value;
    if (selectedText) {
      annotationsActions.updateAnnotation(selectedText.id, { content: value });
    } else {
      annotationsActions.setTextContent(value);
    }
  }

  function handleOpacityChange(e: CustomEvent<number>) {
    annotationsActions.applyStyle({ opacity: e.detail });
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
        <Button
          kind="primary"
          icon={Add}
          onclick={handleAddText}
          disabled={!canAddText}
        >
          {m.annotations_add_text()}
        </Button>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <p class="helper">{m.annotations_add_text_description()}</p>
        <div class="textarea-wrapper">
          <TextArea
            id="text-content"
            labelText={m.annotations_content()}
            value={textEditorValue}
            on:input={handleContentInput}
            placeholder={selectedText ? '' : m.annotations_no_content()}
            rows={5}
          />
        </div>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section text-format-controls">
        <div class="format-buttons">
          <div class:format-btn-active={effectiveStyle.bold}>
            <Button
              kind="ghost"
              size="field"
              iconDescription={m.annotations_bold()}
              icon={TextBold}
              onclick={() =>
                annotationsActions.applyStyle({ bold: !effectiveStyle.bold })}
            />
          </div>
          <div class:format-btn-active={effectiveStyle.italic}>
            <Button
              kind="ghost"
              size="field"
              iconDescription={m.annotations_italic()}
              icon={TextItalic}
              onclick={() =>
                annotationsActions.applyStyle({
                  italic: !effectiveStyle.italic
                })}
            />
          </div>
          <div class:format-btn-active={effectiveStyle.underlined}>
            <Button
              kind="ghost"
              size="field"
              iconDescription={m.annotations_underline()}
              icon={TextUnderline}
              onclick={() =>
                annotationsActions.applyStyle({
                  underlined: !effectiveStyle.underlined
                })}
            />
          </div>
          <div class="separator"></div>
          <div
            class:format-btn-active={effectiveStyle.textAlign ===
              TextAlign.Left}
          >
            <Button
              kind="ghost"
              size="field"
              iconDescription={m.annotations_align_left()}
              icon={TextAlignLeft}
              onclick={() => handleAlignChange(TextAlign.Left)}
            />
          </div>
          <div
            class:format-btn-active={effectiveStyle.textAlign ===
              TextAlign.Center}
          >
            <Button
              kind="ghost"
              size="field"
              iconDescription={m.annotations_align_center()}
              icon={TextAlignCenter}
              onclick={() => handleAlignChange(TextAlign.Center)}
            />
          </div>
          <div
            class:format-btn-active={effectiveStyle.textAlign ===
              TextAlign.Right}
          >
            <Button
              kind="ghost"
              size="field"
              iconDescription={m.annotations_align_right()}
              icon={TextAlignRight}
              onclick={() => handleAlignChange(TextAlign.Right)}
            />
          </div>
        </div>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <Slider
          labelText={m.annotations_opacity()}
          value={toOpacityPercent(effectiveStyle.opacity)}
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
      <div class="section delete-section">
        <Button
          kind="danger-tertiary"
          icon={TrashCan}
          disabled={!selectedText}
          onclick={() =>
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

  .helper {
    margin: 0 0 var(--cds-spacing-03) 0;
    color: var(--cds-text-secondary);
    font-size: 0.875rem;
  }

  .textarea-wrapper :global(.bx--text-area) {
    min-height: 128px;
    height: 128px;
    resize: vertical;
  }

  .text-format-controls {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .format-buttons {
    display: flex;
    align-items: center;
    gap: 0;
  }

  .format-btn-active :global(.bx--btn--ghost) {
    background-color: var(--cds-layer-selected, #e0e0e0);
    color: var(--cds-text-primary, #161616);
  }

  .separator {
    width: 1px;
    height: 24px;
    background-color: var(--cds-border-subtle, #e0e0e0);
    margin: 0 var(--cds-spacing-02);
    flex-shrink: 0;
  }

  .delete-section :global(.bx--btn) {
    width: 100%;
    max-width: 100%;
  }
</style>
