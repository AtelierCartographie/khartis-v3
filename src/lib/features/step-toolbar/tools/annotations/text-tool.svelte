<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { ANNOTATION_ROLE } from '$lib/features/commons/constants';
  import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
  import { TextAlign } from '$lib/features/commons/types/enums';
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { hslToHex, hexToHsl } from '$lib/features/commons/utils/color-utils';
  import {
    AVAILABLE_FONTS,
    CARTOGRAPHIC_FONT_FAMILY,
    FONT_SIZE_OPTIONS,
    MIN_FONT_SIZE,
    clampFontSize,
    normalizeFontFamily
  } from '$lib/features/step-toolbar/fonts.constants';
  import { PRINT_STANDARD_TOKENS } from '$lib/features/commons/utils/layout-sizing.utils';
  import * as m from '$lib/paraglide/messages';
  import {
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
  import { useSelectedAnnotationByType } from './_shared/use-selected-annotation.svelte';

  const annotationsState = $derived(getAnnotationsState());
  const defaultStyle = $derived(annotationsState.defaultStyle);

  const selectedAnnotation = useSelectedAnnotationByType(AnnotationKind.TEXT);
  const selectedText = $derived(selectedAnnotation.selected);

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
  function handleAddText() {
    if (textEditorValue.trim().length === 0) {
      const textarea = document.getElementById(
        'text-content'
      ) as HTMLTextAreaElement | null;
      textarea?.focus();
      return;
    }

    annotationsActions.beginPlacement(AnnotationKind.TEXT, textEditorValue);
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

  const effectiveFont = $derived(
    normalizeFontFamily(effectiveStyle.font) ?? CARTOGRAPHIC_FONT_FAMILY
  );
  const effectiveFontSize = $derived(
    effectiveStyle.fontSize ?? PRINT_STANDARD_TOKENS.annotations.noteFontSize
  );
  const effectiveTextColor = $derived.by(() => {
    const c = effectiveStyle.color;
    if (!c) return { hex: '#000000', hue: 0, saturation: 0, lightness: 0 };
    if (typeof c === 'string') {
      const hsl = hexToHsl(c);
      return { hex: c, ...hsl };
    }
    return { hex: hslToHex(c.hue, c.saturation, c.lightness), ...c };
  });

  const backgroundEnabled = $derived(!!effectiveStyle.backgroundColor);
  const bgColorValue = $derived.by(() => {
    const c = effectiveStyle.backgroundColor;
    if (!c) return { hex: '#ffffff', hue: 0, saturation: 0, lightness: 100 };
    if (typeof c === 'string') {
      const hsl = hexToHsl(c);
      return { hex: c, ...hsl };
    }
    return { hex: hslToHex(c.hue, c.saturation, c.lightness), ...c };
  });
  const bgOpacity = $derived(effectiveStyle.backgroundOpacity ?? 100);

  let localFont = $state<string>(CARTOGRAPHIC_FONT_FAMILY);
  let localFontSize = $state<number>(MIN_FONT_SIZE);

  $effect(() => {
    localFont = effectiveFont;
    localFontSize = clampFontSize(effectiveFontSize, MIN_FONT_SIZE);
  });
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

  <!-- Add button intentionally placed before textarea to match Figma spec -->
  <Row>
    <Column>
      <div class="section add-btn-section">
        <Button kind="primary" icon={Add} onclick={handleAddText}>
          {m.annotations_add_text()}
        </Button>
        <p class="helper">{m.annotations_add_text_description()}</p>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section textarea-wrapper">
        <TextArea
          id="text-content"
          labelText={m.annotations_content()}
          value={textEditorValue}
          on:input={handleContentInput}
          placeholder={selectedText ? '' : m.annotations_no_content()}
          rows={5}
        />
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <div class="text-style-row">
          <div class="text-style-font">
            <Select
              id="annotation-font-select"
              labelText={m.legend_font()}
              selected={localFont}
              on:change={(event) => {
                const nextFont = (event.currentTarget as HTMLSelectElement)
                  .value;
                localFont = nextFont;
                annotationsActions.applyStyle({ font: nextFont });
              }}
              size="sm"
            >
              {#each AVAILABLE_FONTS as f (f)}
                <SelectItem value={f} text={f} />
              {/each}
            </Select>
          </div>
          <div class="text-style-size">
            <Select
              id="annotation-font-size"
              labelText={m.legend_font_size()}
              selected={String(localFontSize)}
              on:change={(event) => {
                const nextFontSize = Number(
                  (event.currentTarget as HTMLSelectElement).value
                );
                if (!Number.isFinite(nextFontSize)) {
                  return;
                }

                localFontSize = nextFontSize;
                annotationsActions.applyStyle({ fontSize: nextFontSize });
              }}
              size="sm"
            >
              {#each FONT_SIZE_OPTIONS as sizeOption (sizeOption)}
                <SelectItem value={sizeOption} text={sizeOption} />
              {/each}
            </Select>
          </div>
        </div>
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section text-format-controls">
        <div class="format-buttons">
          <div class:format-btn-active={effectiveStyle.bold}>
            <IconButton
              kind="ghost"
              size="field"
              iconDescription={m.annotations_bold()}
              icon={TextBold}
              onclick={() =>
                annotationsActions.applyStyle({ bold: !effectiveStyle.bold })}
            />
          </div>
          <div class:format-btn-active={effectiveStyle.italic}>
            <IconButton
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
            <IconButton
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
            <IconButton
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
            <IconButton
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
            <IconButton
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
        <ColorPicker
          triggerLabel={m.color()}
          hex={effectiveTextColor.hex}
          hue={effectiveTextColor.hue}
          saturation={effectiveTextColor.saturation}
          lightness={effectiveTextColor.lightness}
          onValidate={({
            hue,
            saturation,
            lightness
          }: {
            hex: string;
            hue: number;
            saturation: number;
            lightness: number;
          }) => {
            annotationsActions.applyStyle({
              color: { hue, saturation, lightness }
            });
          }}
        />
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
          on:input={handleOpacityChange}
          minLabel=""
          maxLabel=""
        />
      </div>
    </Column>
  </Row>

  <Row>
    <Column>
      <div class="section">
        <div class="bg-row">
          <div class="bg-toggle-col">
            <span class="bg-col-label">{m.legend_background()}</span>
            <Switch
              labelText={m.legend_background()}
              hideLabel
              toggled={backgroundEnabled}
              labelA={m.no()}
              labelB={m.yes()}
              showStateLabel
              onchange={(enabled: boolean) => {
                if (enabled) {
                  annotationsActions.applyStyle({
                    backgroundColor: '#ffffff',
                    backgroundOpacity: bgOpacity
                  });
                } else {
                  annotationsActions.applyStyle({
                    backgroundColor: undefined,
                    backgroundOpacity: undefined
                  });
                }
              }}
            />
          </div>
          <div class="bg-color-col">
            <ColorPicker
              triggerLabel={m.legend_background_color()}
              hex={bgColorValue.hex}
              hue={bgColorValue.hue}
              saturation={bgColorValue.saturation}
              lightness={bgColorValue.lightness}
              disabled={!backgroundEnabled}
              onValidate={({
                hue,
                saturation,
                lightness
              }: {
                hex: string;
                hue: number;
                saturation: number;
                lightness: number;
              }) => {
                annotationsActions.applyStyle({
                  backgroundColor: { hue, saturation, lightness }
                });
              }}
            />
          </div>
        </div>
        <Slider
          labelText={m.legend_opacity()}
          value={bgOpacity}
          disabled={!backgroundEnabled}
          min={0}
          max={100}
          step={5}
          on:input={(e) =>
            annotationsActions.applyStyle({
              backgroundOpacity: (e as CustomEvent).detail
            })}
          minLabel=""
          maxLabel=""
          fullWidth
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
    margin-top: var(--cds-spacing-04);
  }

  .helper {
    margin: var(--cds-spacing-03) 0 0 0;
    color: var(--cds-text-secondary);
    font-size: 0.75rem;
    line-height: 1rem;
  }

  .add-btn-section :global(.bx--btn) {
    width: 100%;
    max-width: 100%;
  }

  .textarea-wrapper :global(.bx--text-area) {
    min-height: 112px;
    height: 112px;
    resize: vertical;
  }

  .text-style-row {
    display: flex;
    align-items: flex-end;
    gap: var(--cds-spacing-02);
  }

  .text-style-font {
    flex: 1;
    min-width: 0;
  }

  .text-style-size {
    width: var(--kh-text-size-control-width, 80px);
    flex-shrink: 0;
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

  /* Arrière plan : toggle + color picker côte à côte */
  .bg-row {
    display: flex;
    align-items: flex-end;
    gap: var(--cds-spacing-03);
    margin-bottom: var(--cds-spacing-03);
  }

  .bg-toggle-col {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
    flex-shrink: 0;
  }

  .bg-col-label {
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--cds-text-secondary, #525252);
    letter-spacing: 0.32px;
  }

  .bg-color-col {
    flex: 1;
    min-width: 0;
  }

  .delete-section :global(.bx--btn) {
    width: 100%;
    max-width: 100%;
  }
</style>
