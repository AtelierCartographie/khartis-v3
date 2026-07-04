<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **khartis-v3** (18161 symbols, 33827 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource                                    | Use for                                  |
| ------------------------------------------- | ---------------------------------------- |
| `gitnexus://repo/khartis-v3/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/khartis-v3/clusters`       | All functional areas                     |
| `gitnexus://repo/khartis-v3/processes`      | All execution flows                      |
| `gitnexus://repo/khartis-v3/process/{name}` | Step-by-step execution trace             |

## CLI

| Task                                         | Read this skill file                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference           | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands      | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |

<!-- gitnexus:end -->

## Communication Economy

- Keep routine progress updates terse and action-oriented; avoid detailed summaries unless the user asks for one.
- Prefer doing the work over narrating it. At the end, report only the outcome, validation performed, and blockers or handoff commands.
- Preserve full reasoning quality internally, but do not expand explanations by default.

## Local Deployment Safety

- The versioned local deployment helper is PPRD-only. Do not add local PRD deploy scripts unless the user explicitly reopens that risk and the safety model is redesigned.
- Never commit real SFTP hosts, usernames, remote paths, passwords, private keys, VPN details, or GitLab credentials. Keep them in ignored local env files or the user's shell.
- Keep `docs/DEPLOYMENT.md` public-safe: document placeholders, commands, and guardrails, not institution-specific secrets or infrastructure values.

## Local Validation Safety

- Follow the code-quality plan's validation mode, including Chrome/browser validation when the plan marks an item for browser proof.
- Run heavyweight validations sequentially. Do not run `pnpm check`, `pnpm lint`, Vitest, browser tools, or dev servers in parallel.
- Prefer the narrowest relevant check for mechanical code-quality-plan items.
- Before and during Chrome/browser validation, monitor memory-heavy processes. If a browser, dev server, Vitest, ESLint, or TypeScript process starts runaway memory/CPU behavior, stop it before continuing.
