# IntelliJ IDEA sessions — the JetBrains `idea` MCP server

Read this only when `mcp__idea__*` tools are available this session (the detection rule
lives in SKILL.md: tool presence, not environment guessing).

The JetBrains `idea` MCP server is defined at **project scope** (`.mcp.json`) but is
deliberately **absent from the committed `.claude/settings.json` `enabledMcpjsonServers`**
list — it activates only where a machine-local setting enables it (the developer machine's
gitignored `.claude/settings.local.json` sets `enableAllProjectMcpServers: true`). It
points at a `127.0.0.1` port (the one in `.mcp.json` — IntelliJ assigns it per machine, so
read the file rather than trusting a number quoted here), which exists only next to a
running IDE; in a cloud session it stays unapproved, or at worst is marked *failed* after
connection retries. Do **not** "fix" that by adding `idea` to the committed
`enabledMcpjsonServers`, and never add it to any `disabledMcpjsonServers` list — a deny at
any scope wins over every enable, including the developer machine's.

## Where the tools pay off in the loop

- *Implement:* after an edit, `get_file_problems` / `lint_files` return the IDE's
  inspection verdict faster than a compile cycle; `rename_refactoring` for symbol
  renames instead of grep-and-replace.
- *Plan / Detect:* `analyze_calls` + `get_symbol_info` when mapping blast radius.
- *Debug:* the `xdebug_*` breakpoint/session tools when `diagnosing-bugs` needs
  runtime state.

They **supplement, never replace** the gates: scoped test runs (`riviera-local-debug`)
and CI remain the verification — an inspection-clean file is not a green build.
