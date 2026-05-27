#!/usr/bin/env sh
#
# doc-sync — keep CLAUDE.md / docs in step with structural changes.
#
# Runs from the Husky pre-commit hook and inspects *staged* files only.
# If a commit touches the project's architecture surface (feature barrels)
# or its build/lint/test config without touching any documentation, it
# prints a reminder so the docs don't silently drift.
#
# Non-blocking by default. Set DOC_SYNC_STRICT=1 to fail the commit instead.
# For testing, override the file list with DOC_SYNC_STAGED="a/b.ts\n...".

staged=${DOC_SYNC_STAGED:-$(git diff --cached --name-only --diff-filter=ACMR)}
[ -n "$staged" ] || exit 0

# Files whose change usually means the docs should follow.
struct=$(printf '%s\n' "$staged" | grep -E \
  '^src/lib/features/[^/]+/index\.ts$|^vite\.config\.(ts|js)$|^svelte\.config\.(js|ts)$|^tsconfig(\..+)?\.json$|^\.prettierrc|^eslint\.config\.(js|ts|mjs|cjs)$|^knip\.(json|ts|js)$')
[ -n "$struct" ] || exit 0

# Documentation touched in the same commit clears the warning.
doc=$(printf '%s\n' "$staged" | grep -E \
  '^CLAUDE\.md$|^AGENTS\.md$|^docs/|^\.claude/rules/')
[ -n "$doc" ] && exit 0

{
  echo
  echo "⚠️  doc-sync: structural changes staged without a documentation update."
  echo
  printf '%s\n' "$struct" | sed 's/^/      • /'
  echo
  echo "   If architecture, commands or conventions changed, update the docs:"
  echo "     – in a Claude session:  /claude-md-management:revise-claude-md"
  echo "     – or edit  CLAUDE.md  /  docs/  /  .claude/rules/"
  echo "   Only a reminder — the commit proceeds. (DOC_SYNC_STRICT=1 to enforce.)"
  echo
} >&2

[ "${DOC_SYNC_STRICT:-0}" = "1" ] && exit 1
exit 0
