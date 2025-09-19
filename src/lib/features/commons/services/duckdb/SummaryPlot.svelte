<script>
	let { svgElement, ...rest } = $props();

	function myplot(node) {
		node.appendChild(svgElement);
	}
</script>

{#key svgElement}
	<div use:myplot {...rest}></div>
{/key}
