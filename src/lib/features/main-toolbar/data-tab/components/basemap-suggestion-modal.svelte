<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    Modal,
    Select,
    SelectItem,
    TextArea,
    TextInput
  } from 'carbon-components-svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open = $bindable(), onClose }: Props = $props();

  let name = $state('');
  let description = $state('');
  let source = $state('');
  let dataLink = $state('');
  let geoLevel = $state('');
  let geoArea = $state('');
  let year = $state('');
  let comments = $state('');

  const geoLevelOptions = [
    { value: '', label: m.basemap_suggestion_level_select() },
    { value: 'countries', label: m.basemap_suggestion_level_countries() },
    { value: 'regions', label: m.basemap_suggestion_level_regions() },
    { value: 'departments', label: m.basemap_suggestion_level_departments() },
    {
      value: 'municipalities',
      label: m.basemap_suggestion_level_municipalities()
    },
    { value: 'other', label: m.basemap_suggestion_level_other() }
  ];

  const geoAreaOptions = [
    { value: '', label: m.basemap_suggestion_area_select() },
    { value: 'world', label: m.basemap_suggestion_area_world() },
    { value: 'europe', label: m.basemap_suggestion_area_europe() },
    { value: 'france', label: m.basemap_suggestion_area_france() },
    { value: 'other', label: m.basemap_suggestion_area_other() }
  ];

  function resetForm() {
    name = '';
    description = '';
    source = '';
    dataLink = '';
    geoLevel = '';
    geoArea = '';
    year = '';
    comments = '';
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function buildGitHubIssueUrl(): string {
    const baseUrl =
      'https://github.com/AtelierCartographie/khartis-v3/issues/new';

    const levelLabel =
      geoLevelOptions.find((o) => o.value === geoLevel)?.label || geoLevel;
    const areaLabel =
      geoAreaOptions.find((o) => o.value === geoArea)?.label || geoArea;

    const bodyLines = [
      '## Basemap Suggestion',
      '',
      `**Name:** ${name}`,
      description ? `**Description:** ${description}` : '',
      `**Data Source:** ${source}`,
      dataLink ? `**Data Link:** ${dataLink}` : '',
      geoLevel ? `**Geographic Level:** ${levelLabel}` : '',
      geoArea ? `**Geographic Area:** ${areaLabel}` : '',
      year ? `**Data Year:** ${year}` : '',
      comments ? `\n**Additional Comments:**\n${comments}` : ''
    ].filter(Boolean);

    const body = bodyLines.join('\n');
    const title = `[Basemap Suggestion] ${name}`;

    const params = new URLSearchParams({
      labels: 'basemap-suggestion',
      title,
      body
    });

    return `${baseUrl}?${params.toString()}`;
  }

  function handleSubmit() {
    const url = buildGitHubIssueUrl();
    window.open(url, '_blank');
    handleClose();
  }

  const isValid = $derived(name.trim() !== '' && source.trim() !== '');
</script>

<Modal
  bind:open={open}
  modalHeading={m.basemap_suggestion_title()}
  primaryButtonText={m.basemap_suggestion_submit()}
  secondaryButtonText={m.basemap_suggestion_cancel()}
  primaryButtonDisabled={!isValid}
  on:click:button--secondary={handleClose}
  on:click:button--primary={handleSubmit}
  on:close={handleClose}
  size="sm"
>
  <div class="suggestion-form">
    <p class="description">{m.basemap_suggestion_description()}</p>

    <div class="form-group">
      <TextInput
        labelText={m.basemap_suggestion_name()}
        placeholder={m.basemap_suggestion_name_placeholder()}
        bind:value={name}
        required
      />
    </div>

    <div class="form-group">
      <TextInput
        labelText={m.basemap_suggestion_source()}
        placeholder={m.basemap_suggestion_source_placeholder()}
        bind:value={source}
        required
      />
    </div>

    <div class="form-group">
      <TextInput
        labelText={m.basemap_suggestion_desc_label()}
        placeholder={m.basemap_suggestion_desc_placeholder()}
        bind:value={description}
      />
    </div>

    <div class="form-row">
      <div class="form-group half">
        <Select
          labelText={m.basemap_suggestion_level()}
          bind:selected={geoLevel}
        >
          {#each geoLevelOptions as opt (opt.value)}
            <SelectItem value={opt.value} text={opt.label} />
          {/each}
        </Select>
      </div>
      <div class="form-group half">
        <Select labelText={m.basemap_suggestion_area()} bind:selected={geoArea}>
          {#each geoAreaOptions as opt (opt.value)}
            <SelectItem value={opt.value} text={opt.label} />
          {/each}
        </Select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group half">
        <TextInput
          labelText={m.basemap_suggestion_year()}
          placeholder="2024"
          bind:value={year}
        />
      </div>
      <div class="form-group half">
        <TextInput
          labelText={m.basemap_suggestion_link()}
          placeholder={m.url_placeholder_ellipsis()}
          bind:value={dataLink}
        />
      </div>
    </div>

    <div class="form-group">
      <TextArea
        labelText={m.basemap_suggestion_comments()}
        placeholder={m.basemap_suggestion_comments_placeholder()}
        bind:value={comments}
        rows={3}
      />
    </div>

    <p class="note">{m.basemap_suggestion_github_note()}</p>
  </div>
</Modal>

<style>
  .suggestion-form {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .description {
    color: var(--cds-text-02);
    font-size: 0.875rem;
    margin-bottom: var(--cds-spacing-02);
  }

  .form-group {
    display: flex;
    flex-direction: column;
  }

  .form-row {
    display: flex;
    gap: var(--cds-spacing-05);
  }

  .half {
    flex: 1;
  }

  .note {
    color: var(--cds-text-03);
    font-size: 0.75rem;
    font-style: italic;
    margin-top: var(--cds-spacing-02);
  }
</style>
