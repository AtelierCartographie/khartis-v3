<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    Checkbox,
    Column,
    ComboBox,
    Grid,
    NumberInput,
    RadioButton,
    RadioButtonGroup,
    Row,
    Select,
    SelectItem,
    Slider,
    TextInput
  } from 'carbon-components-svelte';
  import { Add } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';

  const dataFields = ['sous-alimentation', 'Part sous-alim.', 'Population'];
  const dataFieldItems = dataFields.map((text, id) => ({ id, text }));
  const discretizationMethods = [
    { id: 0, text: 'Jenks, 4 classes' },
    { id: 1, text: 'Quantiles, 5 classes' },
    { id: 2, text: 'Equal intervals, 5 classes' },
    { id: 3, text: 'Manual' }
  ];

  let selectedFieldId = $state<number>(0);
  let selectedColorFieldId = $state<number>(0);
  let selectedDiscretizationId = $state<number>(0);
  let symbolsType = $state<string>('proportionnels');
  let proportionalType = $state<string>('uniques');
  let fillType = $state<string>('classes');
  let labelStrokeType = $state<string>('aucun');

  let symbolMaxSize = $state<number>(24);
  let symbolSize = $state<number>(12);
  let symbolOpacity = $state<number>(80);
  let strokeWidth = $state<number>(1);
  let strokeOpacity = $state<number>(100);

  let feedFillType = $state<string>('unique');
  let feedDiscretizationId = $state<number>(0);
  let feedColorFieldId = $state<number>(0);
  let feedOpacity = $state<number>(100);
  let feedStrokeWidth = $state<number>(1);
  let feedStrokeOpacity = $state<number>(100);

  let polyFillType = $state<string>('unique');
  let polyDiscretizationId = $state<number>(0);
  let polyColorFieldId = $state<number>(0);
  let polyOpacity = $state<number>(100);
  let polyStrokeWidth = $state<number>(2);
  let polyStrokeOpacity = $state<number>(100);

  let lineWidth = $state<number>(1);
  let lineOpacity = $state<number>(100);

  let textFieldId = $state<number>(0);
  let textSecondaryFieldId = $state<number>(0);
  let textSize = $state<number>(12);
  let textOpacity = $state<number>(100);
  let labelBgOpacity = $state<number>(0);
  let showMissingData = $state<boolean>(true);
  let missingText = $state<string>('Absence de données');
</script>

<section id="configure-visualization">
  <MainToolBarHeader title={m.step2_title()} />

  <p class="kh-help">
    {m.step2_description()}
  </p>

  <ExpandableSection
    title="Symboles"
    defaultOpen
    showToggle
    toggleChecked={true}
  >
    {#snippet children()}
      <Grid padding noGutter>
        <Row>
          <Column>
            <h6 class="sub">Taille et forme</h6>
          </Column>
        </Row>

        <Row>
          <Column>
            <RadioButtonGroup legendText="Symboles" bind:selected={symbolsType}>
              <RadioButton
                id="symbols-uniques"
                value="uniques"
                labelText="Uniques"
              />
              <RadioButton
                id="symbols-prop"
                value="proportionnels"
                labelText="Proportionnels"
              />
            </RadioButtonGroup>
          </Column>
        </Row>

        {#if symbolsType === 'proportionnels'}
          <Row>
            <Column>
              <RadioButtonGroup
                legendText="Symboles proportionnels"
                bind:selected={proportionalType}
              >
                <RadioButton
                  id="prop-uniques"
                  value="uniques"
                  labelText="Uniques"
                />
                <RadioButton
                  id="prop-doubles"
                  value="doubles"
                  labelText="Doubles"
                />
              </RadioButtonGroup>
            </Column>
          </Row>

          <Row>
            <Column sm={4} md={8} lg={13}>
              <ComboBox
                items={dataFieldItems}
                selectedId={selectedFieldId}
                on:select={(e) => (selectedFieldId = e.detail.selectedId)}
                placeholder="Taille selon"
                titleText=""
              />
            </Column>
            <Column sm={4} md={8} lg={3}>
              <NumberInput
                id="max-size"
                label=""
                bind:value={symbolMaxSize}
                min={1}
                max={200}
                size="xl"
                hideLabel
              />
            </Column>
          </Row>
        {/if}

        <Row>
          <Column sm={4} md={8} lg={8}>
            <Select id="shape" labelText="Forme">
              <SelectItem value="point" text="Point" />
              <SelectItem value="carre" text="Carré" />
              <SelectItem value="triangle" text="Triangle" />
            </Select>
          </Column>
          <Column sm={4} md={8} lg={8}>
            <div class="slider">
              <Slider
                labelText="Taille"
                min={1}
                max={20}
                step={1}
                bind:value={symbolSize}
                hideTextInput
              />
            </div>
          </Column>
        </Row>

        <Row>
          <Column>
            <h6 class="sub">Fond</h6>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={8}>
            <RadioButtonGroup legendText="Remplissage" bind:selected={fillType}>
              <RadioButton id="fill-unique" value="unique" labelText="Unique" />
              <RadioButton
                id="fill-classes"
                value="classes"
                labelText="En classes"
              />
            </RadioButtonGroup>
          </Column>
          <Column sm={4} md={8} lg={8}>
            <Select id="discretization" labelText="Discrétisation">
              <SelectItem value="jenks" text="Jenks, 4 classes" />
              <SelectItem value="quantiles" text="Quantiles, 5 classes" />
            </Select>
          </Column>
        </Row>

        <Row>
          <Column>
            <div class="palette">
              <div class="swatch" style="--from:#b3d4ff; --to:#001d6c"></div>
              <span>Palette de couleurs</span>
            </div>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={13}>
            <ComboBox
              items={dataFieldItems}
              selectedId={selectedColorFieldId}
              on:select={(e) => (selectedColorFieldId = e.detail.selectedId)}
              placeholder="Couleur selon"
              titleText=""
            />
          </Column>
          <Column sm={4} md={8} lg={3}>
            <NumberInput
              id="symbol-opacity"
              label=""
              bind:value={symbolOpacity}
              min={0}
              max={100}
              size="xl"
              hideLabel
            />
          </Column>
        </Row>

        <Row>
          <Column sm={12} md={12} lg={12}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText="Opacité"
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  bind:value={symbolOpacity}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>

        <Row>
          <Column>
            <h6 class="sub">Contour</h6>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={13}>
            <div class="slider">
              <Slider
                labelText="Épaisseur"
                min={0}
                max={20}
                step={1}
                bind:value={strokeWidth}
                hideTextInput
              />
            </div>
          </Column>
          <Column sm={4} md={8} lg={3}>
            <NumberInput
              id="stroke-width-value"
              label=""
              bind:value={strokeWidth}
              min={0}
              max={20}
              size="xl"
              hideLabel
            />
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={8}>
            <Select id="stroke-color" labelText="Couleur">
              <SelectItem value="blue" text="Bleu" />
              <SelectItem value="gray" text="Gris" />
              <SelectItem value="white" text="Blanc" />
              <SelectItem value="black" text="Noir" />
            </Select>
          </Column>
          <Column sm={8} md={8} lg={8}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText="Opacité"
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  bind:value={strokeOpacity}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>
      </Grid>
    {/snippet}
  </ExpandableSection>

  <ExpandableSection
    title="Feed"
    defaultOpen={false}
    showToggle
    toggleChecked={false}
  >
    {#snippet children()}
      <Grid padding noGutter>
        <Row>
          <Column>
            <h6 class="sub">Fond</h6>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={8}>
            <RadioButtonGroup
              legendText="Remplissage"
              bind:selected={feedFillType}
            >
              <RadioButton
                id="feed-fill-unique"
                value="unique"
                labelText="Unique"
              />
              <RadioButton
                id="feed-fill-classes"
                value="classes"
                labelText="En classes"
              />
            </RadioButtonGroup>
          </Column>
          <Column sm={4} md={8} lg={8}>
            <ComboBox
              items={discretizationMethods}
              selectedId={feedDiscretizationId}
              on:select={(e) => (feedDiscretizationId = e.detail.selectedId)}
              placeholder="Discrétisation"
              titleText=""
            />
          </Column>
        </Row>

        <Row>
          <Column>
            <div class="palette">
              <div class="swatch" style="--from:#ffb3b3; --to:#6c0000"></div>
              <span>Palette de couleurs</span>
            </div>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={13}>
            <ComboBox
              items={dataFieldItems}
              selectedId={feedColorFieldId}
              on:select={(e) => (feedColorFieldId = e.detail.selectedId)}
              placeholder="Couleur selon"
              titleText=""
            />
          </Column>
          <Column sm={4} md={8} lg={3}>
            <NumberInput
              id="feed-opacity"
              label=""
              bind:value={feedOpacity}
              min={0}
              max={100}
              size="xl"
              hideLabel
            />
          </Column>
        </Row>

        <Row>
          <Column sm={12} md={12} lg={12}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText="Opacité"
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  bind:value={feedOpacity}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>

        <Row>
          <Column>
            <h6 class="sub">Contour</h6>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={13}>
            <div class="slider">
              <Slider
                labelText="Épaisseur"
                min={0}
                max={20}
                step={1}
                bind:value={feedStrokeWidth}
                hideTextInput
              />
            </div>
          </Column>
          <Column sm={4} md={8} lg={3}>
            <NumberInput
              id="feed-stroke-width"
              label=""
              bind:value={feedStrokeWidth}
              min={0}
              max={20}
              size="xl"
              hideLabel
            />
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={8}>
            <Select id="feed-stroke-color" labelText="Couleur">
              <SelectItem value="white" text="Blanc" />
              <SelectItem value="black" text="Noir" />
              <SelectItem value="gray" text="Gris" />
            </Select>
          </Column>
          <Column sm={8} md={8} lg={8}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText="Opacité"
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  bind:value={feedStrokeOpacity}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>
      </Grid>
    {/snippet}
  </ExpandableSection>

  <ExpandableSection
    title="Polygones"
    defaultOpen={false}
    showToggle
    toggleChecked={false}
  >
    {#snippet children()}
      <Grid padding noGutter>
        <Row>
          <Column>
            <h6 class="sub">Fond</h6>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={8}>
            <RadioButtonGroup
              legendText="Remplissage"
              bind:selected={polyFillType}
            >
              <RadioButton
                id="poly-fill-unique"
                value="unique"
                labelText="Unique"
              />
              <RadioButton
                id="poly-fill-classes"
                value="classes"
                labelText="En classes"
              />
            </RadioButtonGroup>
          </Column>
          <Column sm={4} md={8} lg={8}>
            <ComboBox
              items={discretizationMethods}
              selectedId={polyDiscretizationId}
              on:select={(e) => (polyDiscretizationId = e.detail.selectedId)}
              placeholder="Discrétisation"
              titleText=""
            />
          </Column>
        </Row>

        <Row>
          <Column>
            <div class="palette">
              <div class="swatch" style="--from:#b3e5ff; --to:#003d6c"></div>
              <span>Palette de couleurs</span>
            </div>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={13}>
            <ComboBox
              items={dataFieldItems}
              selectedId={polyColorFieldId}
              on:select={(e) => (polyColorFieldId = e.detail.selectedId)}
              placeholder="Couleur selon"
              titleText=""
            />
          </Column>
          <Column sm={4} md={8} lg={3}>
            <NumberInput
              id="poly-opacity"
              label=""
              bind:value={polyOpacity}
              min={0}
              max={100}
              size="xl"
              hideLabel
            />
          </Column>
        </Row>

        <Row>
          <Column sm={12} md={12} lg={12}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText="Opacité"
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  bind:value={polyOpacity}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>

        <Row>
          <Column>
            <h6 class="sub">Contour</h6>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={13}>
            <div class="slider">
              <Slider
                labelText="Épaisseur"
                min={0}
                max={20}
                step={1}
                bind:value={polyStrokeWidth}
                hideTextInput
              />
            </div>
          </Column>
          <Column sm={4} md={8} lg={3}>
            <NumberInput
              id="poly-stroke-width"
              label=""
              bind:value={polyStrokeWidth}
              min={0}
              max={20}
              size="xl"
              hideLabel
            />
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={8}>
            <Select id="poly-stroke-color" labelText="Couleur">
              <SelectItem value="white" text="Blanc" />
              <SelectItem value="black" text="Noir" />
              <SelectItem value="gray" text="Gris" />
            </Select>
          </Column>
          <Column sm={8} md={8} lg={8}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText="Opacité"
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  bind:value={polyStrokeOpacity}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>
      </Grid>
    {/snippet}
  </ExpandableSection>

  <ExpandableSection
    title="Lignes"
    defaultOpen={false}
    showToggle
    toggleChecked={false}
  >
    {#snippet children()}
      <Grid padding noGutter>
        <Row>
          <Column sm={4} md={8} lg={13}>
            <div class="slider">
              <Slider
                labelText="Épaisseur"
                min={0}
                max={20}
                step={1}
                bind:value={lineWidth}
                hideTextInput
              />
            </div>
          </Column>
          <Column sm={4} md={8} lg={3}>
            <NumberInput
              id="line-width"
              label=""
              bind:value={lineWidth}
              min={0}
              max={20}
              size="xl"
              hideLabel
            />
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={8}>
            <Select id="line-color" labelText="Couleur">
              <SelectItem value="blue" text="Bleu" />
              <SelectItem value="gray" text="Gris" />
              <SelectItem value="black" text="Noir" />
            </Select>
          </Column>
          <Column sm={8} md={8} lg={8}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText="Opacité"
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  bind:value={lineOpacity}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>
      </Grid>
    {/snippet}
  </ExpandableSection>

  <ExpandableSection
    title="Textes"
    defaultOpen={false}
    showToggle
    toggleChecked={true}
  >
    {#snippet children()}
      <Grid padding noGutter>
        <Row>
          <Column>
            <h6 class="sub">Texte</h6>
          </Column>
        </Row>

        <Row>
          <Column sm={8} md={8} lg={8}>
            <ComboBox
              items={dataFieldItems}
              selectedId={textFieldId}
              on:select={(e) => (textFieldId = e.detail.selectedId)}
              placeholder="Texte selon"
              titleText=""
            />
          </Column>
          <Column sm={4} md={4} lg={4}>
            <Button
              size="field"
              kind="tertiary"
              iconDescription="Ajouter"
              icon={Add}
            />
          </Column>
          <Column sm={4} md={8} lg={8}>
            <Select id="label-color" labelText="Couleur">
              <SelectItem value="black" text="Noir" />
              <SelectItem value="blue" text="Bleu" />
              <SelectItem value="gray" text="Gris" />
            </Select>
          </Column>
        </Row>

        <Row>
          <Column sm={8} md={8} lg={8}>
            <ComboBox
              items={dataFieldItems}
              selectedId={textSecondaryFieldId}
              on:select={(e) => (textSecondaryFieldId = e.detail.selectedId)}
              placeholder="Texte secondaire selon"
              titleText=""
            />
          </Column>
        </Row>

        <Row>
          <Column>
            <Checkbox
              id="show-missing-data"
              labelText="Afficher l'absence de données"
              bind:checked={showMissingData}
            />
          </Column>
        </Row>

        <Row>
          <Column sm={8} md={8} lg={8}>
            <TextInput
              id="missing-text"
              labelText="Texte"
              bind:value={missingText}
            />
          </Column>
          <Column sm={4} md={4} lg={4}>
            <Select id="missing-text-color" labelText="Couleur">
              <SelectItem value="gray-30" text="Gris" />
              <SelectItem value="blue-60" text="Bleu" />
            </Select>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={13}>
            <div class="slider">
              <Slider
                labelText="Taille"
                min={8}
                max={32}
                step={1}
                bind:value={textSize}
                hideTextInput
              />
            </div>
          </Column>
          <Column sm={4} md={8} lg={3}>
            <NumberInput
              id="text-size"
              label=""
              bind:value={textSize}
              min={8}
              max={32}
              size="xl"
              hideLabel
            />
          </Column>
        </Row>

        <Row>
          <Column sm={12} md={12} lg={12}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText="Opacité"
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  bind:value={textOpacity}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>

        <Row>
          <Column>
            <h6 class="sub">Fond</h6>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={8}>
            <Select id="label-bg-color" labelText="Couleur">
              <SelectItem value="none" text="Aucun" />
              <SelectItem value="white" text="Blanc" />
              <SelectItem value="gray" text="Gris" />
            </Select>
          </Column>
          <Column sm={8} md={8} lg={8}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText="Opacité"
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  bind:value={labelBgOpacity}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>

        <Row>
          <Column>
            <h6 class="sub">Contour</h6>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={8}>
            <RadioButtonGroup legendText="" bind:selected={labelStrokeType}>
              <RadioButton
                id="label-stroke-none"
                value="aucun"
                labelText="Aucun"
              />
              <RadioButton
                id="label-stroke-unique"
                value="unique"
                labelText="Unique"
              />
            </RadioButtonGroup>
          </Column>
          <Column sm={4} md={8} lg={8}>
            <Select
              id="label-stroke-color"
              labelText="Couleur"
              disabled={labelStrokeType === 'aucun'}
            >
              <SelectItem value="white" text="Blanc" />
              <SelectItem value="black" text="Noir" />
              <SelectItem value="gray" text="Gris" />
            </Select>
          </Column>
        </Row>
      </Grid>
    {/snippet}
  </ExpandableSection>
</section>

<style lang="scss">
  #configure-visualization {
    background-color: var(--cds-ui-02);
    padding: var(--cds-spacing-05);
  }

  .kh-help {
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-05);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .sub {
    margin: var(--cds-spacing-03) 0;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .slider-inline {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--cds-spacing-03);
    align-items: center;
  }

  .palette {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    margin: var(--cds-spacing-02) 0;
  }

  .palette .swatch {
    width: 160px;
    height: 16px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--from), var(--to));
    border: 1px solid var(--cds-border-subtle);
  }
</style>
