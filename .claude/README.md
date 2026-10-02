# Coding-agent setup

Shared, version-controlled configuration for coding agents working on Khartis. Using an agent is optional: nothing here is needed to build, run or contribute to the project.

## How instructions are organized

| File                         | Role                                                                                                                         | Loaded                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `../AGENTS.md`               | Single source of truth for every agent: constraints, commands, validation, conventions, index of the area rules              | Every session                          |
| `../CLAUDE.md`               | One-line import of `AGENTS.md`, for Claude Code versions before 2.1.277 that do not read `AGENTS.md` on their own            | Every Claude Code session              |
| `rules/*.md`                 | Traps and contracts of one area, scoped by a `paths:` frontmatter                                                            | When Claude Code reads a matching file |
| `skills/browser-check/`      | How to verify a change in the running app                                                                                    | On demand, or with `/browser-check`    |
| `skills/svelte-code-writer/` | Svelte 5 documentation lookup and autofixer through the `@sveltejs/mcp` CLI (body mirrors the upstream `sveltejs/mcp` skill) | On demand                              |
| `settings.json`              | Team settings: plugins and permission guardrails                                                                             | Every Claude Code session              |
| `settings.local.json`        | Personal overrides, git-ignored                                                                                              | Your sessions only                     |

Agents other than Claude Code read `AGENTS.md`, then open the rule file it points to. Codex discovers the two skills through the relative links in `../.agents/skills/`, so a skill is written once, under `skills/`.

## Keeping it useful

- `AGENTS.md` holds only what an agent needs in every session and cannot derive from the code. Keep it under 200 lines, and prefer fixing a line over adding one.
- A constraint that concerns one area goes in a path-scoped rule. A multi-step procedure goes in a skill. Something that must never happen goes in `settings.json` permissions, because an instruction is a request, not a guarantee.
- Every symbol, path and command cited in these files has to exist. `scripts/check-doc-sync.sh` reminds you at commit time when a structural change comes without a documentation update.
- After a model upgrade, run `/doctor prompt-audit` in Claude Code. It reviews the whole set for instructions written for an older model, stale references and files that contradict each other.

## Working with the agent

Practices that fit current models, taken from Anthropic's guidance for Opus 5.5:

- Give the whole task in one message and say what "done" means, for example "`pnpm test:duckdb` passes and every join bucket shows its count". Then let it run, and add to a running task instead of restarting it.
- Leave out "think hard" or "be thorough". Depth comes from the effort level: low for a quick question, medium for routine work, high for a bug in the data or render pipeline and for a review. Max uses about three times the tokens of low.
- For an audit or a change across many files, ask for subagents and for the evidence behind each finding.
- Before a pull request, run `/code-review` on the diff, and `/browser-check` when the change touches rendering or persistence.

## Settings

- **Permissions**: reading or writing `.env` and `.env.*` files is denied (`.env.example` stays readable), so deployment secrets never enter a conversation. Editing generated output is denied (`src/lib/paraglide/`, `static/duckdb-extensions/`). The real deployment commands always ask for confirmation.
- **Plugins** (official marketplace), installed once per developer with `claude plugin install <name>@claude-plugins-official --scope project`:

  | Plugin                | Purpose                                                    | Prerequisite                                           |
  | --------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
  | `typescript-lsp`      | Go-to-definition, references and diagnostics on TypeScript | `npm install -g typescript-language-server typescript` |
  | `duckdb-skills`       | Query data files and search the DuckDB documentation       | DuckDB CLI                                             |
  | `chrome-devtools-mcp` | Drive Chrome for a live browser check                      | Chrome                                                 |

## Optional local tool

**Ragmir** (`.ragmir/`, git-ignored) is a local retrieval index over the specification, the docs, the source and the tests. It is not required. `pnpm ragmir setup --agents claude,codex --no-ingest`, add sources to `.ragmir/config.json`, then `pnpm ragmir ingest`. The generated `.ragmir/agent-setup.md` explains how to register the MCP server.
