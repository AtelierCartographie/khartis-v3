<script lang="ts">
  import FontFamilySelect from '$lib/features/step-toolbar/font-family-select.svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { ANNOTATION_ROLE } from '$lib/features/commons/constants';
  import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
  import { TextAlign } from '$lib/features/commons/types/enums';
  import BackgroundSettings from '$lib/features/commons/components/background-settings.svelte';
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import { SliderWithInput } from '$lib/features/commons/components/viz-controls';
  import { hexToHsl, hslToHex } from '$lib/features/commons/utils/color-utils';
  import {
    CARTOGRAPHIC_FONT_FAMILY,
    clampFontSize,
    DEFAULT_FONT_SIZE,
    normalizeFontFamily,
    resolveFontSizeOptions
  } from '$lib/features/step-toolbar/fonts.constants';
  import { PRINT_STANDARD_TOKENS } from '$lib/features/commons/utils/layout-sizing.utils';
  import * as m from '$lib/paraglide/messages';
  import { Select, SelectItem, TextArea } from 'carbon-components-svelte';
  import {
    Add,
    TextAlignCenter,
    TextAlignLeft,
    TextAlignRight,
    TextBold,
    TextItalic,
    TextUnderline
  } from 'carbon-icons-svelte';
  import {
    annotationsActions,
    getAnnotationsState
  } from './annotations.store.svelte';
  import { useSelectedAnnotationByType } from './_shared/use-selected-annotation.svelte';
  import { getTextAnnotationName } from './_shared/annotation-name';
  import AnnotationToolPanel from './_shared/annotation-tool-panel.svelte';
  import {
    getPageElementPlaceholder,
    hasPageElementDefaultWording
  } from './annotations-placeholders.utils';

  const annotationsState = $derived(getAnnotationsState());
  const defaultStyle = $derived(annotationsState.defaultStyle);

  const selectedAnnotation = useSelectedAnnotationByType(AnnotationKind.TEXT);
  const selectedText = $derived(selectedAnnotation.selected);

  const effectiveStyle = $derived(selectedText?.style ?? defaultStyle);

  const predefinedStyles = $derived.by(() => [
    { value: ANNOTATION_ROLE.NOTE, text: m.annotations_note() },
    { value: ANNOTATION_ROLE.TITLE, text: m.annotations_style_title() },
    { value: ANNOTATION_ROLE.SUBTITLE, text: m.annotations_style_subtitle() },
    { value: 'caption', text: m.annotations_style_caption() }
  ]);

  const formatToggles = $derived([
    {
      key: 'bold',
      label: m.annotations_bold(),
      icon: TextBold,
      active: !!effectiveStyle.bold,
      toggle: () =>
        annotationsActions.applyStyle({ bold: !effectiveStyle.bold })
    },
    {
      key: 'italic',
      label: m.annotations_italic(),
      icon: TextItalic,
      active: !!effectiveStyle.italic,
      toggle: () =>
        annotationsActions.applyStyle({ italic: !effectiveStyle.italic })
    },
    {
      key: 'underline',
      label: m.annotations_underline(),
      icon: TextUnderline,
      active: !!effectiveStyle.underlined,
      toggle: () =>
        annotationsActions.applyStyle({
          underlined: !effectiveStyle.underlined
        })
    }
  ]);

  const alignToggles = $derived([
    {
      value: TextAlign.Left,
      label: m.annotations_align_left(),
      icon: TextAlignLeft
    },
    {
      value: TextAlign.Center,
      label: m.annotations_align_center(),
      icon: TextAlignCenter
    },
    {
      value: TextAlign.Right,
      label: m.annotations_align_right(),
      icon: TextAlignRight
    }
  ]);

  // A page text still at its default wording shows it as the field's hint,
  // so that typing writes the text instead of editing « Ajouter un titre ».
  const selectedPlaceholder = $derived(
    selectedText && hasPageElementDefaultWording(selectedText)
      ? String(selectedText.content)
      : null
  );

  const textEditorValue = $derived(
    selectedText && !selectedPlaceholder
      ? String(selectedText.content ?? '')
      : ''
  );

  function deleteSelectedText(): void {
    if (selectedText) {
      annotationsActions.removeAnnotation(selectedText.id);
    }
  }

  function handleAddText(): void {
    annotationsActions.beginPlacement(
      AnnotationKind.TEXT,
      m.annotations_text_default_content()
    );
  }

  function handleContentInput(e: Event): void {
    if (!selectedText) return;
    const value = (e.currentTarget as HTMLTextAreaElement).value;
    // A cleared page text goes back to its placeholder.
    const placeholder =
      value === '' && selectedText.role
        ? getPageElementPlaceholder(selectedText.role)
        : null;
    annotationsActions.updateAnnotation(selectedText.id, {
      content: placeholder ?? value
    });
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
  let localFontSize = $state<number>(DEFAULT_FONT_SIZE);
  const fontSizeOptions = $derived(resolveFontSizeOptions(localFontSize));

  $effect(() => {
    localFont = effectiveFont;
    localFontSize = clampFontSize(effectiveFontSize, DEFAULT_FONT_SIZE);
  });
</script>

<AnnotationToolPanel
  help={m.annotations_text_help()}
  actionLabel={m.annotations_add_text()}
  actionIcon={Add}
  onaction={handleAddText}
  selectionLabel={m.annotations_selected_text()}
  selectedName={selectedText ? getTextAnnotationName(selectedText) : undefined}
  deleteLabel={m.annotations_delete_text()}
  ondelete={deleteSelectedText}
>
  {#snippet properties()}
    <div class="textarea-wrapper">
      <TextArea
        id="text-content"
        labelText={m.annotations_content()}
        value={textEditorValue}
        on:input={handleContentInput}
        placeholder={selectedPlaceholder ?? ''}
        rows={5}
      />
    </div>

    <Select
      size="sm"
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

    <div class="text-style-row">
      <div class="text-style-font">
        <FontFamilySelect
          id="annotation-font-select"
          labelText={m.legend_font()}
          value={localFont}
          fallback={CARTOGRAPHIC_FONT_FAMILY}
          onchange={(nextFont) => {
            localFont = nextFont;
            annotationsActions.applyStyle({ font: nextFont });
          }}
        />
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
          {#each fontSizeOptions as sizeOption (sizeOption)}
            <SelectItem value={sizeOption} text={sizeOption} />
          {/each}
        </Select>
      </div>
    </div>

    <div class="format-buttons">
      {#each formatToggles as toggle (toggle.key)}
        <div class:format-btn-active={toggle.active}>
          <IconButton
            kind="ghost"
            size="field"
            iconDescription={toggle.label}
            icon={toggle.icon}
            aria-pressed={toggle.active}
            onclick={toggle.toggle}
          />
        </div>
      {/each}
      <div class="separator"></div>
      {#each alignToggles as align (align.value)}
        {@const active = effectiveStyle.textAlign === align.value}
        <div class:format-btn-active={active}>
          <IconButton
            kind="ghost"
            size="field"
            iconDescription={align.label}
            icon={align.icon}
            aria-pressed={active}
            onclick={() =>
              annotationsActions.applyStyle({ textAlign: align.value })}
          />
        </div>
      {/each}
    </div>

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

    <SliderWithInput
      label={m.annotations_opacity()}
      value={toOpacityPercent(effectiveStyle.opacity)}
      min={0}
      max={100}
      step={5}
      inputWidth="72px"
      showSteppers={false}
      onchange={(opacity) => {
        if (toOpacityPercent(effectiveStyle.opacity) === opacity) return;
        annotationsActions.applyStyle({ opacity });
      }}
    />

    <hr class="annotation-divider" />

    <BackgroundSettings
      enabled={backgroundEnabled}
      color={bgColorValue}
      opacity={bgOpacity}
      shadow={effectiveStyle.backgroundShadow ?? false}
      onEnabledChange={(enabled) =>
        annotationsActions.applyStyle(
          enabled
            ? { backgroundColor: '#ffffff', backgroundOpacity: bgOpacity }
            : {
                backgroundColor: undefined,
                backgroundOpacity: undefined,
                backgroundShadow: undefined
              }
        )}
      onColorChange={(backgroundColor) =>
        annotationsActions.applyStyle({ backgroundColor })}
      onOpacityChange={(backgroundOpacity) => {
        if (backgroundOpacity !== bgOpacity) {
          annotationsActions.applyStyle({ backgroundOpacity });
        }
      }}
      onShadowChange={(backgroundShadow) =>
        annotationsActions.applyStyle({ backgroundShadow })}
    />
  {/snippet}
</AnnotationToolPanel>

<style>
  .textarea-wrapper :global(.bx--text-area) {
    min-height: 112px;
    height: 112px;
    resize: vertical;
  }

  .text-style-row {
    display: flex;
    align-items: flex-end;
    gap: var(--kh-gap-inline);
  }

  .text-style-font {
    flex: 1;
    min-width: 0;
  }

  .text-style-size {
    width: var(--kh-text-size-control-width, 80px);
    flex-shrink: 0;
  }

  .format-buttons {
    display: flex;
    align-items: center;
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
</style>
