# Agent Rules for this Workspace

## Git Usage and Backups
**CRITICAL RULE**: The USER does not use Git for incremental commits themselves; they only use it for final releases. 
- Because of this, the repository can have months of uncommitted work at any given time.
- **MANDATORY BACKUP**: Before making significant code changes, you MUST create a backup commit to save the user's progress. Use: `git add .` and `git commit -m "AI Backup before changes"`.
- **RESTORING WORK**: You are ONLY allowed to use `git restore`, `git checkout`, or `git reset` if you have explicitly created a backup commit first. You may use these commands to revert the workspace back to your backup commit if you make a mistake.
- **NEVER** use destructive git commands to go back further than your most recent backup commit. Doing so will permanently wipe out the USER's uncommitted work.
- **STRICT FORBIDDEN REMOTE PUSH**: NEVER run `git push`, push commits, push tags, or sync git to the remote GitHub repository under ANY circumstances. The user only wants releases distributed as compiled binaries (e.g. the installer `.exe` in `release/`), and NEVER wants the source code or local commit tree pushed to GitHub. Remote git pushing is strictly forbidden.

## App-Wide UI Lock & Scope Discipline
- **STRICT GLOBAL UI LOCK**: NEVER alter, add, remove, or modify ANY UI components, layouts, badges, styling, or pages anywhere in the app unless the user explicitly requests that specific change.
- **SURGICAL SCOPE**: Focus 100% on the exact logic or bug requested. Do NOT refactor, touch, or adjust unrelated UI components, styles, or page layouts.

## Thorough & Comprehensive Implementation
- **FULL APP AUDIT ON REQUESTS**: When the user requests a feature, change, or fix, you MUST search and update ALL invocation sites, services, IPC channels, and pages across the entire codebase. Never leave partial or incomplete implementations.

## Code Protection, IP & Build Hardening
- **PROTECT INTELLECTUAL PROPERTY & LOGIC**: Never distribute unprotected plain-text JavaScript logic for critical features (savegame parsing, conflict algorithms, scraper logic, server sync mechanics).
- **OBFUSCATION & MINIFICATION INTEGRITY**: Always ensure production builds have obfuscation and minification active on both renderer and main process scripts before creating release packages.
- **SOURCE CODE EXPOSURE PREVENTION**: Do not leave unminified debug logs, source maps (.map), or plaintext backend source files exposed in packaged distributions or public release directories.
- **STRICT LICENSING & ATTRIBUTION**: Preserve copyright notices and proprietary rights for Mark / MarkThor on all custom architectures, custom algorithms, and UI assets across the application.
