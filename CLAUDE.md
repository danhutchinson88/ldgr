# LDGR Steering

## Purpose
Build `ldgr` into a dependable personal finance tool that saves time, reduces cognitive load, and stays low-maintenance.

## Product Priorities
1. Trustworthy financial logic and metrics
2. Smooth setup and first-run experience
3. Clear, calm dashboard UX
4. Automation and sensible defaults over manual upkeep
5. Small, useful feature set over feature sprawl

## Development Rules
- Fix correctness before adding features.
- Treat misleading metrics as product bugs.
- Treat setup friction as product bugs.
- Prefer defaults that work out of the box.
- De-scope anything that makes the app feel like more of a project than a tool.
- Keep the UI editorial, calm, and legible rather than dense or flashy.
- Avoid speculative forecasting unless the underlying data is trustworthy enough.

## Agent Behavior
- When an advanced workflow feature would materially help, call it out briefly.
- Only suggest hooks, skills, MCPs, or other setup when they clearly reduce future effort.
- Recommend the lightest-weight option first.
- Offer to create the needed file or configuration directly.

## Review Lens
- Prioritize bugs, regressions, misleading UX, setup issues, and maintenance burden.
- Favor changes that make the tool easier to trust and easier to live with week to week.
