import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

const ignoredPaths = [
  'node_modules',
  'build',
  'dist',
  'dev-dist',
  '.svelte-kit',
  'src/paraglide'
];

export default ts.config(
  {
    ignores: ignoredPaths
  },
  includeIgnoreFile(gitignorePath),
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_'
        }
      ],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'function' },
        { blankLine: 'always', prev: 'function', next: '*' },
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: 'export' },
        { blankLine: 'always', prev: 'directive', next: '*' },
        { blankLine: 'any', prev: 'directive', next: 'directive' },
        {
          blankLine: 'always',
          prev: 'import',
          next: ['const', 'let', 'var', 'function', 'class']
        }
      ],
      'lines-between-class-members': ['error', 'always']
    }
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        extraFileExtensions: ['.svelte'],
        svelteConfig
      }
    },
    rules: {
      'svelte/no-navigation-without-resolve': 'off',
      'svelte/no-unnecessary-state-wrap': 'off',
      'svelte/no-restricted-html-elements': [
        'error',
        {
          elements: ['button', 'input', 'select'],
          message:
            'Native <button>/<input>/<select> elements are forbidden. Use Carbon Components Svelte (Button, TextInput, NumberInput, Select, ComboBox, Link, Slider) instead. Primitives in commons/components/ that wrap native elements have a targeted override.'
        }
      ]
    }
  },
  {
    files: [
      'src/lib/features/commons/components/**/*.svelte',
      'src/lib/features/main-toolbar/components/toolbar-tabs.svelte',
      'src/lib/features/main-toolbar/mobile-toolbar.svelte',
      'src/lib/features/data-tab/components/basemap-import-dropzone.svelte',
      'src/lib/features/data-tab/components/expanded-table-modal.svelte',
      'src/lib/features/data-tab/components/join-accordion.svelte',
      'src/lib/features/data-tab/components/section-header-with-icon.svelte',
      'src/lib/features/data-tab/components/basemap-join/basemap-import-tab.svelte',
      'src/lib/features/data-tab/components/basemap-join/join-assisted-section.svelte',
      'src/lib/features/visualization-tab/components/basemap-layers/basemap-style-selector.svelte',
      'src/lib/features/visualization-tab/components/choose-visualization.svelte',
      'src/lib/features/visualization-tab/components/shared/**/*.svelte',
      'src/lib/features/visualization-tab/components/texts/**/*.svelte',
      'src/lib/features/map/components/map-tooltip-overlay.svelte',
      'src/lib/features/map/components/zoom-toolbar.svelte',
      'src/lib/features/step-toolbar/step-toolbar.svelte',
      'src/lib/features/step-toolbar/tools/facets/facets.svelte',
      'src/lib/features/step-toolbar/tools/projections/projection-main.svelte'
    ],
    rules: {
      'svelte/no-restricted-html-elements': 'off'
    }
  },
  {
    files: ['**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser
      }
    },
    rules: {
      'svelte/no-navigation-without-resolve': 'off',
      'svelte/prefer-svelte-reactivity': 'off'
    }
  }
);
