<script lang="ts">
  import Separator from '$lib/features/commons/components/separator.svelte';
  import { Pin } from 'carbon-icons-svelte';

  interface Props {
    title: string;
  }

  let { title }: Props = $props();
</script>

<header class="mb-4">
  <section class="flex items-center gap-5 mb-3">
    <Pin size={24} />

    <h5>{title}</h5>
  </section>

  <Separator orientation="horizontal" />
</header>
