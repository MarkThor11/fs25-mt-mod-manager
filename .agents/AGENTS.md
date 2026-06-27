# Agent Rules for this Workspace

## Git Usage and Backups
**CRITICAL RULE**: The USER does not use Git for incremental commits themselves; they only use it for final releases. 
- Because of this, the repository can have months of uncommitted work at any given time.
- **MANDATORY BACKUP**: Before making significant code changes, you MUST create a backup commit to save the user's progress. Use: `git add .` and `git commit -m "AI Backup before changes"`.
- **RESTORING WORK**: You are ONLY allowed to use `git restore`, `git checkout`, or `git reset` if you have explicitly created a backup commit first. You may use these commands to revert the workspace back to your backup commit if you make a mistake.
- **NEVER** use destructive git commands to go back further than your most recent backup commit. Doing so will permanently wipe out the USER's uncommitted work.
