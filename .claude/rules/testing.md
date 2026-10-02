---
paths:
  - '**/*.test.ts'
  - 'tests/**'
  - 'vite.config.ts'
  - 'vitest-setup-*.ts'
---

# Tests

The suite is small on purpose. Most Khartis bugs come from combinations of UI interactions, WebGL rendering, the DuckDB WASM worker and IndexedDB restore, and a jsdom test with mocks proves none of them. Tests go where they are cheap and decisive. Types, lint, the build and a live browser check cover the rest.

## A test earns its place when it guards

- a cartographic or statistical rule: class breaks and rounded bounds, color assignment, join grading, CRS detection and reprojection, suggestion scoring, semiology detection, legend values, symbol sizes, label placement;
- an import boundary: CSV dialect and header detection, decimal separators, malformed files, GPS validation, format detection, archives;
- SQL, a macro or a reader, run against the real engine in `tests/duckdb/`;
- the compatibility contract: schema migrations, `.kh` import and export, restore of persisted state;
- a non-trivial pure algorithm with edge cases;
- a release or safety gate: the deploy script, the PWA cache policy, privacy rules;
- a bug whose cause was a non-obvious logic error, as input to output.

## Do not write

- a test whose assertions are `toHaveBeenCalled...` on `vi.mock`ed modules of this repository: it mirrors the implementation and breaks on every refactor;
- a jsdom render that asserts markup, a class name, a label, a default prop, a prop forwarded to Carbon, or that a click calls a callback;
- a test that reads source files and asserts on their text, when ESLint, knip or TypeScript can hold the rule;
- a test of constants, enum values, getters and setters, one-line guards or lookup tables;
- a jsdom simulation of WebGL, a Deck.gl or MapLibre lifecycle, the Service Worker or IndexedDB with mocked collaborators;
- a second test of a behavior already proven at a better level, for example a mocked client test of an operation `tests/duckdb/` runs on the real engine.

What these would have checked is verified in the running app with `.claude/skills/browser-check/SKILL.md`, and the report says so.

## Test first, only when it pays

Write the test before the code when the expected result can be stated up front: a domain rule, a parser boundary, a SQL result, a migration, or a bug reproduced as input to output. For UI wiring, layout, rendering and exploratory work, write the code, check it live, and add a test afterwards only if it meets the bar above. A change without a new test is fine when nothing in it meets that bar.

## Projects

- `client` (`src/**/*.svelte.test.ts`, next to the code) runs in Node. A file that needs a DOM starts with `// @vitest-environment jsdom`. `vitest-setup-client.ts` mocks DuckDB WASM and `$lib/features/duckdb`.
- `server` (`tests/pipeline/`, `tests/duckdb/`) runs in Node, one forked process per file, in parallel. `vitest-global-setup-server.ts` installs the `spatial` extension once before the files start, so a test opens its own in-memory instance and never installs an extension itself.

## Shape

- When a component holds a rule worth testing, move the rule into a pure function and test the function.
- Mock external boundaries only: network, `Worker`, DuckDB WASM in the client project. A test that needs several internal mocks is aimed at the wrong level.
- Add a case to an existing file before creating one: each test file has a fixed cost that outweighs its assertions.
- Name tests `should [expected] when [condition]`.
- When code is removed or reshaped, delete the tests that only described its old shape instead of rewriting them to follow it.
