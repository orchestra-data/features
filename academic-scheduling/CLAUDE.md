# Feature Pack — Installation Instructions for AI Agents

## CRITICAL: Read This First

This is a self-installing feature pack for the Cogedu monorepo.
**DO NOT manually copy files.** Use the installer script.

## Installation (3 commands)

```bash
# 1. Dry run first (see what will happen, zero changes)
bash install.sh . --dry-run

# 2. Install for real
bash install.sh .

# 3. Validate installation
bash validate-install.sh .
```

## If Something Goes Wrong

```bash
# Undo everything (restores all files to pre-install state)
bash install.sh . --rollback
```

## How It Works

1. `manifest.json` contains the EXACT mapping of every file → where it goes
2. `install.sh` reads manifest.json and copies files to the right places
3. It also registers routes, runs migrations, installs npm deps
4. `validate-install.sh` verifies everything landed correctly
5. If anything fails, `--rollback` undoes ALL changes (backups are automatic)

## DO NOT

- Do NOT manually copy files from backend/ or frontend/ to the monorepo
- Do NOT manually edit router.tsx — the installer handles it
- Do NOT run migrations manually — the installer handles it
- Do NOT guess paths — manifest.json has the exact destinations

## manifest.json Structure

The manifest is machine-readable. Key sections:

- `file_map[]` — Every file with `src` (in pack) and `dest` (in monorepo)
- `install_steps[]` — Ordered steps with commands and rollback commands
- `route_registration` — Exact imports and JSX to add to router.tsx
- `validation.endpoints_expected[]` — Every endpoint with method, path, expected status
- `troubleshooting[]` — Known issues with symptom → cause → fix
- `database.column_gotchas[]` — Common wrong column names → correct names

## For Human Review

- `manifest.json` → Complete technical specification
- `screenshots/` → Visual proof of the feature working
- `evidence/` → API test evidence (curl outputs)

## Questions?

If the installer fails, check `troubleshooting` in manifest.json first.
Every known issue has a concrete fix command.
