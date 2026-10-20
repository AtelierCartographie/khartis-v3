<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Button } from 'carbon-components-svelte';
  import {
    ArrowUpRight,
    CloseOutline,
    Corner,
    Reset
  } from 'carbon-icons-svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { SectionHeading } from '$lib/features/commons/components/viz-controls';
  import { LABEL_LEADER_STYLES, labelLayoutStore } from '$lib/features/map';

  interface Props {
    vizId: string;
  }

  let { vizId }: Props = $props();

  const layout = $derived(labelLayoutStore.getLayout(vizId));
  const leaderStyleIndex = $derived(
    LABEL_LEADER_STYLES.indexOf(layout.leaderStyle)
  );
  const movedLabelCount = $derived(Object.keys(layout.offsets).length);
  const leaderStyleItems = $derived([
    { icon: ArrowUpRight, label: m.label_leader_straight(), iconSize: 16 },
    { icon: Corner, label: m.label_leader_elbow(), iconSize: 16 },
    { icon: CloseOutline, label: m.label_leader_none(), iconSize: 16 }
  ]);

  function handleLeaderStyleChange(index: number): void {
    const style = LABEL_LEADER_STYLES[index];
    if (style) {
      labelLayoutStore.setLeaderStyle(vizId, style);
    }
  }
</script>

<SectionHeading
  title={m.label_placement_title()}
  infoText={m.label_placement_info()}
/>

<div class="field-group">
  <ToggleTabs
    items={leaderStyleItems}
    size="md"
    activeIndex={leaderStyleIndex}
    onchange={handleLeaderStyleChange}
    hideInactiveLabel={true}
  />
</div>

{#if movedLabelCount > 0}
  <div class="field-group">
    <Button
      kind="ghost"
      size="small"
      icon={Reset}
      on:click={() => labelLayoutStore.clearOffsets(vizId)}
    >
      {movedLabelCount === 1
        ? m.label_placement_reset_one()
        : m.label_placement_reset({ count: movedLabelCount })}
    </Button>
  </div>
{/if}
