<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import {
    Button,
    FileUploaderDropContainer,
    FileUploaderItem,
    InlineNotification,
    TextArea,
    TextInput
  } from 'carbon-components-svelte';
  import { CloudDownload, Link } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import ProjectName from './project-name.svelte';

  interface Props {
    onClose?: () => void;
    isModal?: boolean;
  }

  const { onClose, isModal = false }: Props = $props();
</script>

<section
  id="khartis-create-new-project"
  class={clsx('grid grid-cols-1 gap-3', isModal && 'is-modal-create-project')}
>
  <header class="mb-4">
    {#if !isModal}
      <h6 class="mb-3">Importer des données</h6>
    {/if}

    <span class="text-grey">
      Il peut s’agir d’un tableau de données au format csv ou d’un fichier
      d’informations géographiques (shp, geojson, geopackage).
    </span>
  </header>

  <div class="grid grid-cols-2 gap-5">
    <div>
      <FileUploaderDropContainer
        labelText={m.create_project_drag_drop_file()}
        multiple
        validateFiles={(files) => {
          return files.filter((file) => file.size < 1_024);
        }}
        on:change={(e) => {
          console.log(e.detail);
        }}
      />
    </div>

    <div>
      <TextArea placeholder={m.create_project_paste_data()} />
    </div>
  </div>

  <div class="grid grid-cols-1 gap-7">
    <div class="flex items-end gap-3">
      <TextInput
        labelText={m.create_project_online_file_link()}
        placeholder="https://"
      />

      <div>
        <Button size="field" icon={CloudDownload}
          >{m.create_project_load()}</Button
        >
      </div>
    </div>

    <div>
      <FileUploaderItem class="w-full" name="lorem-ipsum.shp" status="edit" />

      <FileUploaderItem
        class="w-full"
        name="lorem-ipsum.shp"
        status="uploading"
      />

      <FileUploaderItem
        invalid
        id="readme"
        name="README.md"
        errorSubject="File size exceeds 500kb limit"
        errorBody="Please select a new file."
        status="edit"
      />

      <FileUploaderItem
        class="w-full"
        name="lorem-ipsum.shp"
        status="uploading"
      />

      <InlineNotification
        lowContrast
        title="Error:"
        subtitle="An internal server error occurred."
      />

      <FileUploaderItem
        class="w-full"
        name="lorem-ipsum.shp"
        status="complete"
      />
    </div>

    <div class="flex items-center gap-3 text-grey">
      <span>{m.create_project_learn_more_data()}</span>

      <Link size={24} />
    </div>
  </div>

  {#if !isModal}
    <ProjectName onClose={onClose} />
  {/if}
</section>

<style>
  #khartis-create-new-project {
    margin-bottom: 42px;
  }

  .is-modal-create-project {
    margin-bottom: 0 !important;
  }

  #khartis-create-new-project :global(.bx--file__selected-file) {
    max-width: 100%;
  }

  #khartis-create-new-project :global(.bx--text-area) {
    background-color: var(--cds-field-01);
  }
</style>
