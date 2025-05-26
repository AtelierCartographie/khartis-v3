<script lang="ts">
	import {
		Column,
		Content,
		Grid,
		Header,
		HeaderAction,
		HeaderPanelDivider,
		HeaderPanelLink,
		HeaderPanelLinks,
		HeaderUtilities,
		Row,
		SkipToContent,
		Theme
	} from 'carbon-components-svelte';
	import type { CarbonTheme } from 'carbon-components-svelte/src/Theme/Theme.svelte';
	import { SettingsAdjust, UserAvatarFilledAlt } from 'carbon-icons-svelte';

	import 'carbon-components-svelte/css/all.css';

	import { setLocale } from '$lib/paraglide/runtime';
	import '../app.css';

	let { children } = $props();

	let theme: CarbonTheme = $state('white');

	let isOpen1 = $state(false);
	let isOpen2 = $state(false);
	let isOpen3 = $state(false);
</script>

<Theme bind:theme />

<Header company="IBM" platformName="Carbon Svelte" isSideNavOpen>
	<svelte:fragment slot="skip-to-content">
		<SkipToContent />
	</svelte:fragment>

	<HeaderUtilities>
		<HeaderAction
			bind:isOpen={isOpen1}
			iconDescription="Settings"
			tooltipAlignment="start"
			icon={SettingsAdjust}
			on:open={() => {
				isOpen2 = false;
				isOpen3 = false;
			}}
		>
			<HeaderPanelLinks>
				<HeaderPanelDivider>Switcher subject 1</HeaderPanelDivider>
				<HeaderPanelLink>Switcher item 1</HeaderPanelLink>
				<HeaderPanelDivider>Switcher subject 2</HeaderPanelDivider>
				<HeaderPanelLink>Switcher item 1</HeaderPanelLink>
			</HeaderPanelLinks>
		</HeaderAction>

		<HeaderAction
			bind:isOpen={isOpen2}
			iconDescription="Profile"
			icon={UserAvatarFilledAlt}
			on:open={() => {
				isOpen1 = false;
				isOpen3 = false;
			}}
		>
			<HeaderPanelLinks>
				<div>
					<button onclick={() => setLocale('fr')}>fr</button>
					<button onclick={() => setLocale('en')}>en</button>
					<button onclick={() => setLocale('es')}>es</button>
					<button onclick={() => setLocale('de')}>de</button>
					<button onclick={() => setLocale('pt')}>pt</button>
				</div>

				<HeaderPanelDivider>Switcher subject 1</HeaderPanelDivider>
				<HeaderPanelLink>Switcher item 1</HeaderPanelLink>
				<HeaderPanelDivider>Switcher subject 2</HeaderPanelDivider>
				<HeaderPanelLink>Switcher item 1</HeaderPanelLink>
			</HeaderPanelLinks>
		</HeaderAction>

		<HeaderAction
			bind:isOpen={isOpen3}
			text="Switcher text"
			on:open={() => {
				isOpen1 = false;
				isOpen2 = false;
			}}
		>
			<HeaderPanelLinks>
				<HeaderPanelDivider>Switcher subject 1</HeaderPanelDivider>
				<HeaderPanelLink>Switcher item 1</HeaderPanelLink>
			</HeaderPanelLinks>
		</HeaderAction>
	</HeaderUtilities>
</Header>

<Content>
	<Grid>
		<Row>
			<Column>
				{@render children()}
			</Column>
		</Row>
	</Grid>
</Content>
