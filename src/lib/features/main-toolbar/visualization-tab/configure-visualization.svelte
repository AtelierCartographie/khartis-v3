<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import Separator from '$lib/features/commons/components/separator.svelte';
  import {
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
    TextInput,
    Toggle
  } from 'carbon-components-svelte';

  // TODO hook to real data inputs when available
  const dataFields = ['sous-alimentation', 'Part sous-alim.', 'Population'];
  const dataFieldItems = dataFields.map((text, id) => ({ id, text }));
  let selectedFieldId = $state<number>(0);
</script>

<section>
  <header class="step-header">
    <h5>{m.step2_title()}</h5>
    <p class="kh-help">
      {m.step2_description()}
    </p>
    <Separator orientation="horizontal" />
  </header>

  <!-- Symboles -->
  <ExpandableSection
    title={m.symbols_title()}
    defaultOpen
    showToggle
    toggleChecked={true}
  >
    {#snippet children()}
      <Grid padding noGutter>
        <Row>
          <Column>
            <h6 class="sub">{m.size_and_shape()}</h6>
          </Column>
        </Row>

        <Row>
          <Column>
            <RadioButtonGroup legendText="Symboles" selected="proportionnels">
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

        <Row>
          <Column>
            <RadioButtonGroup
              legendText="Symboles proportionnels"
              selected="uniques"
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
              label="Taille maximum"
              value={24}
              min={1}
              max={200}
              size="xl"
            />
          </Column>
        </Row>

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
                value={12}
                hideTextInput
              />
            </div>
          </Column>
        </Row>

        <Row>
          <Column sm={8} md={12} lg={12}>
            <Toggle
              id="toggle-missing-size"
              toggled={true}
              labelA="Non"
              labelB="Oui"
              labelText="Afficher l'absence de données"
              size="sm"
            />
          </Column>
        </Row>

        <Row>
          <Column>
            <h6 class="sub">{m.background()}</h6>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={8}>
            <RadioButtonGroup legendText="Remplissage" selected="classes">
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
              selectedId={selectedFieldId}
              on:select={(e) => (selectedFieldId = e.detail.selectedId)}
              placeholder="Couleur selon"
              titleText=""
            />
          </Column>
          <Column sm={4} md={8} lg={3}>
            <NumberInput
              id="opacity"
              label="Opacité"
              value={80}
              min={0}
              max={100}
              size="xl"
            />
          </Column>
        </Row>

        <Row>
          <Column sm={12} md={12} lg={12}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText=""
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  value={80}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>

        <Row>
          <Column sm={8} md={12} lg={12}>
            <Toggle
              id="toggle-missing-fill"
              toggled={true}
              labelA="Non"
              labelB="Oui"
              labelText="Afficher l'absence de données"
              size="sm"
            />
          </Column>
        </Row>

        <Row>
          <Column sm={8} md={8} lg={8}>
            <Select id="missing-color" labelText="Couleur">
              <SelectItem value="gray-30" text="Gris" />
              <SelectItem value="blue-60" text="Bleu" />
            </Select>
          </Column>
          <Column sm={4} md={4} lg={4}>
            <Toggle
              id="pattern"
              toggled={false}
              labelA="Non"
              labelB="Oui"
              labelText="Motif"
              size="sm"
            />
          </Column>
        </Row>

        <Row>
          <Column>
            <h6 class="sub">{m.stroke()}</h6>
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
                value={1}
                hideTextInput
              />
            </div>
          </Column>
          <Column sm={4} md={8} lg={3}>
            <Select id="stroke-color" labelText="Couleur">
              <SelectItem value="blue" text="Bleu" />
              <SelectItem value="gray" text="Gris" />
            </Select>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={6}>
            <Toggle
              id="dashed"
              toggled={false}
              labelA="Non"
              labelB="Oui"
              labelText="Pointillés"
              size="sm"
            />
          </Column>
          <Column sm={8} md={8} lg={10}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText="Opacité"
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  value={100}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>
      </Grid>
    {/snippet}
  </ExpandableSection>

  <!-- Polygones -->
  <ExpandableSection
    title={m.polygons_title()}
    defaultOpen={false}
    showToggle
    toggleChecked={false}
  >
    {#snippet children()}
      <Grid padding noGutter>
        <Row>
          <Column>
            <h6 class="sub">{m.background()}</h6>
          </Column>
        </Row>
        <Row>
          <Column sm={4} md={8} lg={13}>
            <Select id="poly-fill" labelText="Couleur">
              <SelectItem value="unique" text="Unique" />
            </Select>
          </Column>
          <Column sm={4} md={8} lg={3}>
            <NumberInput
              id="poly-opacity"
              label="Opacité"
              value={100}
              min={0}
              max={100}
              size="xl"
            />
          </Column>
        </Row>

        <Row>
          <Column sm={12} md={12} lg={12}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText=""
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  value={100}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>

        <Row>
          <Column>
            <h6 class="sub">{m.stroke()}</h6>
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
                value={1}
                hideTextInput
              />
            </div>
          </Column>
          <Column sm={4} md={8} lg={3}>
            <Select id="poly-stroke-color" labelText="Couleur">
              <SelectItem value="blue" text="Bleu" />
              <SelectItem value="gray" text="Gris" />
            </Select>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={6}>
            <Toggle
              id="poly-dashed"
              toggled={false}
              labelA="Non"
              labelB="Oui"
              labelText="Pointillés"
              size="sm"
            />
          </Column>
          <Column sm={8} md={8} lg={10}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText="Opacité"
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  value={100}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>
      </Grid>
    {/snippet}
  </ExpandableSection>

  <!-- Lignes -->
  <ExpandableSection
    title={m.lines_title()}
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
                value={1}
                hideTextInput
              />
            </div>
          </Column>
          <Column sm={4} md={8} lg={3}>
            <Select id="line-color" labelText="Couleur">
              <SelectItem value="blue" text="Bleu" />
              <SelectItem value="gray" text="Gris" />
            </Select>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={6}>
            <Toggle
              id="line-dashed"
              toggled={false}
              labelA="Non"
              labelB="Oui"
              labelText="Pointillés"
              size="sm"
            />
          </Column>
          <Column sm={8} md={8} lg={10}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText="Opacité"
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  value={100}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>
      </Grid>
    {/snippet}
  </ExpandableSection>

  <!-- Étiquettes -->
  <ExpandableSection
    title={m.labels_title()}
    defaultOpen={false}
    showToggle
    toggleChecked={true}
  >
    {#snippet children()}
      <Grid padding noGutter>
        <Row>
          <Column sm={4} md={8} lg={8}>
            <ComboBox
              items={dataFieldItems}
              selectedId={selectedFieldId}
              on:select={(e) => (selectedFieldId = e.detail.selectedId)}
              placeholder="Texte selon"
              titleText=""
            />
          </Column>
          <Column sm={4} md={8} lg={8}>
            <Select id="label-color" labelText="Couleur">
              <SelectItem value="blue" text="Bleu" />
              <SelectItem value="gray" text="Gris" />
            </Select>
          </Column>
        </Row>

        <Row>
          <Column sm={4} md={8} lg={8}>
            <ComboBox
              items={dataFieldItems}
              selectedId={selectedFieldId}
              on:select={(e) => (selectedFieldId = e.detail.selectedId)}
              placeholder="Texte secondaire selon"
              titleText=""
            />
          </Column>
          <Column sm={4} md={8} lg={8}>
            <Toggle
              id="labels-missing"
              toggled={true}
              labelA="Non"
              labelB="Oui"
              labelText="Afficher l'absence de données"
              size="sm"
            />
          </Column>
        </Row>

        <Row>
          <Column sm={8} md={8} lg={8}>
            <TextInput
              id="missing-text"
              labelText="Texte"
              placeholder="Absence de données"
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
                labelText="Taille du texte"
                min={8}
                max={32}
                step={1}
                value={12}
                hideTextInput
              />
            </div>
          </Column>
          <Column sm={4} md={8} lg={3}>
            <NumberInput
              id="label-opacity"
              label="Opacité"
              value={100}
              min={0}
              max={100}
              size="xl"
            />
          </Column>
        </Row>

        <Row>
          <Column sm={12} md={12} lg={12}>
            <div class="slider-inline">
              <span class="min">0</span>
              <div class="slider">
                <Slider
                  labelText=""
                  hideTextInput
                  min={0}
                  max={100}
                  step={1}
                  value={100}
                />
              </div>
              <span class="max">100</span>
            </div>
          </Column>
        </Row>

        <Row>
          <Column>
            <h6 class="sub">{m.background()}</h6>
          </Column>
        </Row>
        <Row>
          <Column sm={4} md={8} lg={13}>
            <Select id="label-bg-color" labelText="Couleur">
              <SelectItem value="blue" text="Bleu" />
              <SelectItem value="gray" text="Gris" />
            </Select>
          </Column>
          <Column sm={4} md={8} lg={3}>
            <NumberInput
              id="label-bg-opacity"
              label="Opacité"
              value={0}
              min={0}
              max={100}
              size="xl"
            />
          </Column>
        </Row>

        <Row>
          <Column>
            <h6 class="sub">{m.stroke()}</h6>
          </Column>
        </Row>
        <Row>
          <Column sm={4} md={8} lg={8}>
            <RadioButtonGroup legendText="" selected="aucun">
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
            <Select id="label-stroke-color" labelText="Couleur">
              <SelectItem value="blue" text="Bleu" />
              <SelectItem value="gray" text="Gris" />
            </Select>
          </Column>
        </Row>
      </Grid>
    {/snippet}
  </ExpandableSection>
</section>

<style lang="scss">
  .step-header {
    margin-bottom: var(--cds-spacing-05);

    h5 {
      margin-bottom: var(--cds-spacing-03);
      font-weight: 600;
    }
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
