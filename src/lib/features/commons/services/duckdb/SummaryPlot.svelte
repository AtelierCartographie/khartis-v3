<script lang="ts">
	let { svgElement, ...rest } = $props();

	function myplot(node: HTMLElement) {
		node.appendChild(svgElement);
	}
</script>

{#key svgElement}
	<div use:myplot {...rest}></div>
{/key}
