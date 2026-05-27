# Claude Code setup (shared)

This folder holds the **shared, version-controlled** [Claude Code](https://claude.com/claude-code) configuration for Khartis. It is committed on purpose so the whole team — and external contributors — get the same AI assistance, rules, and tooling. Using Claude Code is **optional**; nothing here is required to build, run, or contribute to the project.

Personal or machine-specific settings live in `.claude/settings.local.json`, which is git-ignored. Only commit changes here that should apply to everyone.

## What's in here

| Path                  | Purpose                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `settings.json`       | Team config: the list of enabled Claude Code plugins (below).                                        |
| `settings.local.json` | Your personal overrides (permissions, env). **Git-ignored** — never committed.                       |
| `rules/`              | Path-scoped quality rules, auto-loaded when you edit matching files (see below).                     |
| `skills/`             | Committed skills: the GitNexus skill set and `svelte-code-writer`.                                   |
| `../.mcp.json`        | MCP servers shared with the team — currently **GitNexus** (code intelligence).                       |
| `../CLAUDE.md`        | Project memory Claude reads at session start (commands, architecture, conventions, GitNexus how-to). |

## Rules (`rules/`)

Each file is one topic. Files with a `paths:` frontmatter only load when Claude touches matching files; files without it are always loaded. They never contradict `CLAUDE.md` — they extend it.

- `cartography-invariants.md` — domain primer + EN/FR glossary, graphic semiology, the two engine boundaries, privacy, live updates (always loaded).
- `code-quality.md` — KISS/DRY/YAGNI/SOLID, atomic changes, value-driven tests (always loaded).
- `critical-thinking.md` — challenge flawed requests, verify premises (always loaded).
- `duckdb-data.md` · `render-pipeline.md` · `colors-classification.md` · `projections.md` · `state-persistence.md` · `svelte-carbon-ui.md` — path-scoped technical rules.
- `chrome-devtools-testing.md` — how to validate/debug the running app in the browser.

## Enabled plugins (`settings.json`)

All from the official `claude-plugins-official` marketplace. How to use each:

| Plugin                 | What it's for                            | How to use                                                                                     |
| ---------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `feature-dev`          | Plan & architect a feature before coding | Ask Claude to plan a feature, or run the `feature-dev` skill; spawns architect/explorer agents |
| `code-review`          | Review the current diff                  | `/code-review` (add `--fix` to apply, `--comment` to post inline PR comments)                  |
| `commit-commands`      | Conventional commits & PR flow           | `/commit`, `/commit-push-pr`, `/clean_gone`                                                    |
| `claude-md-management` | Keep `CLAUDE.md` & rules current         | `/revise-claude-md` — pairs with the `check-doc-sync.sh` pre-commit reminder                   |
| `pr-review-toolkit`    | Deep PR review                           | `/review-pr`; specialized reviewers (silent-failure, type-design, tests, comments)             |
| `hookify`              | Create/manage Claude Code hooks          | `/hookify` to turn a repeated correction into a hook                                           |
| `typescript-lsp`       | LSP-backed TS navigation & diagnostics   | Used automatically by Claude for accurate go-to-def / diagnostics                              |
| `duckdb-skills`        | DuckDB-specific helpers                  | Auto-triggers on DuckDB/SQL work — see `rules/duckdb-data.md`                                  |
| `chrome-devtools-mcp`  | Drive Chrome & inspect runtime           | Used for live browser debugging — see `rules/chrome-devtools-testing.md`                       |

## GitNexus (code intelligence)

The repo is indexed by GitNexus and exposed to Claude Code through `../.mcp.json` (started on demand via `npx gitnexus`). It powers impact analysis, dependency-aware navigation, and safe refactors. See the GitNexus how-to section in `../CLAUDE.md` and the skills under `skills/`.

```bash
npx gitnexus analyze            # (re)build the local index after large changes
npx gitnexus analyze --embeddings   # preserve embeddings if previously generated
```

The index lives in a local `.gitnexus/` directory and is not required for normal development.
