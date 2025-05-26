# Add Internationalization to Khartis

Your goal is to add proper internationalization to existing components or create new i18n messages.

## Process

1. Identify hardcoded text strings that need translation
2. Create message keys in `messages/{locale}.json` files
3. Replace hardcoded strings with Paraglide-JS calls
4. Ensure French is the base language (primary)

## Message Format

Add to `messages/fr.json` (base language):

```json
{
	"component_title": "Titre du composant",
	"welcome_message": "Bienvenue, {name}!",
	"button_save": "Enregistrer",
	"error_required_field": "Ce champ est obligatoire"
}
```

Then add corresponding translations to `messages/en.json`, `messages/es.json`, etc.

## Component Usage

```svelte
<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { setLocale } from '$lib/paraglide/runtime';
</script>

<h1>{m.welcome_message({ name: 'Utilisateur' })}</h1>
<button onclick={() => setLocale('en')}>English</button>
```

## Locale Switching

Use `setLocale()` for client-side locale changes in this SPA.

Please specify which component or text needs internationalization.
