# Add Internationalization Support

Add or update internationalization for text in Khartis v3.

Provide the text keys and French base translations if not already specified.

## Requirements

- Add new message keys to `messages/fr.json` (base language)
- Use descriptive, hierarchical key names (e.g., `map.legend.title`)
- Include context parameters when needed: `m.welcome({ name: 'User' })`
- Update component to use `$lib/paraglide/messages.js`
- Run `pnpm machine-translate` to generate other language versions
- Test all supported locales: fr, en, es, de, pt

## Implementation Pattern

1. **Add to messages/fr.json:**

```json
{
	"component": {
		"title": "Titre du composant",
		"description": "Description avec {parameter}",
		"actions": {
			"save": "Enregistrer",
			"cancel": "Annuler"
		}
	}
}
```

2. **Use in component:**

```svelte
<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
</script>

<h1>{m.component_title()}</h1>
<p>{m.component_description({ parameter: 'valeur' })}</p>
<button>{m.component_actions_save()}</button>
```

3. **Test locale switching:**

```svelte
<script lang="ts">
	import { setLocale, onLanguageChange } from '$lib/paraglide/runtime';
</script>

<select onchange={(e) => setLocale(e.target.value)}>
	<option value="fr">Français</option>
	<option value="en">English</option>
</select>
```

Never hardcode user-facing text strings directly in components.
