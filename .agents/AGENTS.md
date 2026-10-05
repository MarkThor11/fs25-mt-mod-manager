# Agent Rules for this Workspace

## Git Usage and Backups
**CRITICAL RULE**: The USER does not use Git for incremental commits themselves; they only use it for final releases. 
- Because of this, the repository can have months of uncommitted work at any given time.
- **MANDATORY BACKUP**: Before making significant code changes, you MUST create a backup commit to save the user's progress. Use: `git add .` and `git commit -m "AI Backup before changes"`.
- **RESTORING WORK**: You are ONLY allowed to use `git restore`, `git checkout`, or `git reset` if you have explicitly created a backup commit first. You may use these commands to revert the workspace back to your backup commit if you make a mistake.
- **NEVER** use destructive git commands to go back further than your most recent backup commit. Doing so will permanently wipe out the USER's uncommitted work.
## App-Wide UI Lock & Scope Discipline
- **STRICT GLOBAL UI LOCK**: NEVER alter, add, remove, or modify ANY UI components, layouts, badges, styling, or pages anywhere in the app unless the user explicitly requests that specific change.
- **SURGICAL SCOPE**: Focus 100% on the exact logic or bug requested. Do NOT refactor, touch, or adjust unrelated UI components, styles, or page layouts.

## Thorough & Comprehensive Implementation
- **FULL APP AUDIT ON REQUESTS**: When the user requests a feature, change, or fix, you MUST search and update ALL invocation sites, services, IPC channels, and pages across the entire codebase. Never leave partial or incomplete implementations.
