# Internationalization with Paraglide.js

## 1. Overview

### 1.1 Paraglide.js integration

Khartis uses Paraglide.js from the Inlang ecosystem for type-safe, tree-shakable internationalization. Messages are compiled at build time into optimized JavaScript modules, ensuring zero runtime overhead and full TypeScript support. The system detects user language from browser preferences and allows manual switching.

### 1.2 Key features

- Compile-time message transformation for optimal bundle size
- Type-safe message functions with auto-completion
- Automatic language detection and routing
- Tree-shaking of unused translations
- Reactive language switching without page reload
- Markdown support in messages for rich formatting

### 1.3 Architecture benefits

The compile-time approach eliminates JSON parsing at runtime. Each message becomes a function returning the localized string. Unused messages are tree-shaken from production bundles. TypeScript ensures message keys are valid and parameters match expected types.

## 2. Configuration

### 2.1 Project setup

Paraglide configuration lives in `project.inlang/settings.json`:

```json
{
  "sourceLanguageTag": "en",
  "languageTags": ["en", "fr"],
  "modules": ["@inlang/message-lint-rule/*"],
  "plugin.inlang.messageFormat": {
    "pathPattern": "./messages/{languageTag}.json"
  }
}
```

The Vite plugin in `vite.config.ts` handles compilation and HMR. SvelteKit adapter in `src/lib/paraglide/` manages language detection and routing.

### 2.2 Language files

Messages are stored in `messages/{languageTag}.json`. English serves as the source language with French as the primary translation target. Machine translation via DeepL provides initial translations that are manually refined.

### 2.3 Build integration

The build process compiles messages into `src/lib/paraglide/messages.js`. Type definitions are generated in `src/lib/paraglide/messages.d.ts`. Development mode provides hot reload on message changes.

## 3. Usage patterns

### 3.1 Basic usage in components

Import and use message functions directly:

```svelte
<script lang="ts">
  import * as m from '$lib/paraglide/messages'
</script>

<h1>{m.project_title()}</h1>
<p>{m.welcome_message()}</p>
<button>{m.button_save()}</button>
```

### 3.2 Parameterized messages

Pass parameters to message functions for dynamic content:

```svelte
<script lang="ts">
  import * as m from '$lib/paraglide/messages'

  let userName = 'Alice'
  let count = 5
</script>

<p>{m.greeting({ name: userName })}</p>
<p>{m.item_count({ count })}</p>
```

Message definition:
```json
{
  "greeting": "Hello {name}!",
  "item_count": "You have {count} {count, plural, one {item} other {items}}"
}
```

### 3.3 Language switching

Use the language store for reactive updates:

```svelte
<script lang="ts">
  import { languageTag } from '$lib/paraglide/runtime'
  import { availableLanguageTags } from '$lib/paraglide/runtime'

  function switchLanguage(lang: string) {
    languageTag.set(lang)
  }
</script>

<select on:change={(e) => switchLanguage(e.currentTarget.value)}>
  {#each availableLanguageTags as lang}
    <option value={lang} selected={lang === $languageTag}>
      {lang}
    </option>
  {/each}
</select>
```

### 3.4 Markdown in messages

Rich text formatting using markdown:

```json
{
  "help_text": "Click **File → Open** to load a project.\n\nSupported formats:\n- CSV\n- GeoJSON\n- Shapefile"
}
```

## 4. Message organization

### 4.1 Naming conventions

Messages follow a hierarchical naming pattern:

- Feature areas: `data_`, `viz_`, `layout_`, `export_`
- UI elements: `button_`, `label_`, `placeholder_`, `title_`
- States: `loading_`, `error_`, `success_`, `empty_`
- Actions: `action_save`, `action_delete`, `action_create`

### 4.2 Message categories

**UI Components**
- Buttons, labels, placeholders
- Tooltips and help text
- Navigation elements

**Data Operations**
- Import/export messages
- Validation errors
- Processing status

**Visualization**
- Layer names and descriptions
- Legend labels
- Statistical summaries

**System Messages**
- Error notifications
- Success confirmations
- Warning dialogs

### 4.3 Context preservation

Messages maintain context through prefixes:

```json
{
  "data_import_title": "Import Data",
  "data_import_button": "Select File",
  "data_import_success": "File imported successfully",
  "data_import_error": "Import failed: {reason}"
}
```

## 5. Development workflow

### 5.1 Adding new messages

1. Add message to `messages/en.json`
2. Run machine translation: `yarn machine-translate`
3. Review and refine translations in `messages/fr.json`
4. Import and use in component

### 5.2 Message validation

Linting rules check for:
- Missing translations
- Unused messages
- Invalid placeholders
- Inconsistent formatting

Run validation: `yarn paraglide:lint`

### 5.3 Testing translations

Preview different languages in development:
- URL parameter: `?lang=fr`
- Browser language preference
- Manual language switcher

## 6. Best practices

### 6.1 Message design

**Keep messages concise**: UI text should be brief and scannable. Long explanations belong in documentation or help panels.

**Use consistent terminology**: Maintain a glossary of domain terms. Translate consistently across all messages.

**Consider text expansion**: French text is typically 15-30% longer than English. Design layouts to accommodate expansion.

### 6.2 Parameter usage

**Type-safe parameters**: Define parameter types in message functions. TypeScript enforces correct usage.

**Avoid string concatenation**: Use parameters instead of building strings. This ensures proper translation structure.

**Format numbers and dates**: Use Intl formatters for locale-appropriate display.

### 6.3 Performance optimization

**Import specific messages**: Import only needed messages rather than the entire namespace. Tree-shaking removes unused translations.

**Lazy load feature messages**: Split translations by feature area. Load on-demand for code splitting benefits.

**Cache compiled messages**: Production builds cache compiled message functions. Avoid dynamic message selection when possible.

## 7. Integration points

### 7.1 SvelteKit hooks

Server and client hooks initialize the language context:

```typescript
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks'
import { i18n } from '$lib/paraglide/server'

export const handle = sequence(i18n.handle())
```

### 7.2 Component patterns

Reusable components accept message functions as props:

```svelte
<script lang="ts">
  export let title: () => string
  export let description: () => string
</script>

<article>
  <h2>{title()}</h2>
  <p>{description()}</p>
</article>
```

### 7.3 Store synchronization

Language changes trigger store updates:

```typescript
import { languageTag } from '$lib/paraglide/runtime'
import { derived } from 'svelte/store'

export const localizedData = derived(
  [languageTag, dataStore],
  ([$lang, $data]) => {
    return processDataForLanguage($data, $lang)
  }
)
```

## 8. Troubleshooting

### 8.1 Common issues

**Missing translations**: Check message exists in all language files. Run machine translation for new messages.

**Type errors**: Regenerate types after message changes. Ensure parameters match message placeholders.

**Runtime errors**: Verify message function is imported. Check for typos in message keys.

### 8.2 Debug mode

Enable verbose logging in development:

```typescript
// vite.config.ts
paraglide({
  project: './project.inlang',
  outdir: './src/lib/paraglide',
  debug: true
})
```

### 8.3 Migration guide

When updating Paraglide versions:

1. Review changelog for breaking changes
2. Update configuration if needed
3. Regenerate message types
4. Test all language switches
5. Verify message parameters