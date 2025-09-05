<script>
  import { m } from '$lib/paraglide/messages.js';
  import { Button, TextInput } from 'carbon-components-svelte';
  import { Save } from 'carbon-icons-svelte';
</script>

<div id="khartis-project-title" class="project-title">
  <TextInput light size="sm" placeholder={m.project_placeholder()} />

  <div class="project-title-save">
    <Button
      size="small"
      tooltipPosition="bottom"
      tooltipAlignment="end"
      iconDescription={m.save_tooltip()}
      kind="ghost"
      icon={Save}
    />
  </div>
</div>

<style>
  .project-title {
    position: absolute;
    top: 9px;
    bottom: 9px;
    left: 50%;
    transform: translateX(-50%);
    width: 250px;
  }

  .project-title-save {
    position: absolute;
    top: 0;
    left: 100%;
    height: 100%;
  }

  #khartis-project-title :global(input::placeholder) {
    text-align: center;
  }
</style>
