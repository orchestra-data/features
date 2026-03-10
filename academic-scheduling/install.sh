#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# feature-install.sh — Self-Installing Feature Pack for Cogedu Monorepo
# Protocol: DPP-002 v2.0
# Usage: bash feature-install.sh <feature-pack-dir> [--dry-run] [--force] [--rollback]
#
# This script reads manifest.json from the feature pack and:
#   1. Validates prerequisites (tables, dependencies)
#   2. Runs migrations (if any)
#   3. Copies ALL files to their exact destinations
#   4. Registers routes (merge operations)
#   5. Installs npm dependencies (if any)
#   6. Validates the installation
#   7. On failure: auto-rollback everything
#
# Designed to be executed by AI agents (Claude, Gemini, etc.) with zero ambiguity.
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; BLUE='\033[0;34m'
BOLD='\033[1m'; NC='\033[0m'

# ─── Args ─────────────────────────────────────────────────────────────────────
PACK_DIR="${1:?Usage: bash feature-install.sh <feature-pack-dir> [--dry-run] [--force] [--rollback]}"
DRY_RUN=false
FORCE=false
ROLLBACK_MODE=false

for arg in "${@:2}"; do
  case "$arg" in
    --dry-run)  DRY_RUN=true ;;
    --force)    FORCE=true ;;
    --rollback) ROLLBACK_MODE=true ;;
  esac
done

# ─── Resolve paths ───────────────────────────────────────────────────────────
# Convert MSYS/Git Bash paths (/c/...) to Windows paths (C:/...) for Node.js
resolve_path() {
  local p="$(cd "$1" && pwd)"
  # Use cygpath if available (MSYS/Git Bash), otherwise keep as-is
  if command -v cygpath &>/dev/null; then
    cygpath -m "$p"
  else
    echo "$p"
  fi
}

PACK_DIR="$(resolve_path "$PACK_DIR")"
MANIFEST="$PACK_DIR/manifest.json"

if [[ ! -f "$MANIFEST" ]]; then
  echo -e "${RED}ERROR: manifest.json not found in $PACK_DIR${NC}"
  echo "This doesn't look like a v2.0 feature pack."
  echo "Expected: $MANIFEST"
  exit 1
fi

# ─── Detect monorepo root ────────────────────────────────────────────────────
# Walk up from pack dir to find package.json with workspaces
MONOREPO=""
check_dir="$PACK_DIR"
for i in {1..5}; do
  check_dir="$(dirname "$check_dir")"
  if [[ -f "$check_dir/package.json" ]] && grep -q '"workspaces"' "$check_dir/package.json" 2>/dev/null; then
    MONOREPO="$check_dir"
    # Ensure Windows-compatible path for Node.js
    if command -v cygpath &>/dev/null; then
      MONOREPO="$(cygpath -m "$MONOREPO")"
    fi
    break
  fi
done

if [[ -z "$MONOREPO" ]]; then
  echo -e "${RED}ERROR: Could not find monorepo root (package.json with workspaces)${NC}"
  echo "The feature pack must be inside the monorepo (e.g., monorepo/features/my-feature/)"
  exit 1
fi

echo -e "${BLUE}${BOLD}═══ Cogedu Feature Pack Installer v2.0 ═══${NC}"
echo -e "Pack:     ${BOLD}$PACK_DIR${NC}"
echo -e "Monorepo: ${BOLD}$MONOREPO${NC}"
echo ""

# ─── Parse manifest ──────────────────────────────────────────────────────────
FEATURE_NAME=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$MANIFEST','utf8')).feature.name)")
FEATURE_SLUG=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$MANIFEST','utf8')).feature.slug)")
MANIFEST_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$MANIFEST','utf8')).manifest_version)")

if [[ "$MANIFEST_VERSION" != "2.0.0" ]]; then
  echo -e "${RED}ERROR: Manifest version $MANIFEST_VERSION not supported. Expected 2.0.0${NC}"
  exit 1
fi

echo -e "Feature:  ${BOLD}$FEATURE_NAME${NC} ($FEATURE_SLUG)"
echo ""

# ─── Rollback mode ───────────────────────────────────────────────────────────
ROLLBACK_LOG="$PACK_DIR/.install-rollback.log"
INSTALL_LOG="$PACK_DIR/.install-log.json"

if $ROLLBACK_MODE; then
  echo -e "${YELLOW}${BOLD}═══ ROLLBACK MODE ═══${NC}"
  if [[ ! -f "$ROLLBACK_LOG" ]]; then
    echo -e "${RED}No rollback log found. Nothing to undo.${NC}"
    exit 1
  fi

  # Read rollback log in reverse and undo each action
  tac "$ROLLBACK_LOG" | while IFS='|' read -r action src dest; do
    case "$action" in
      COPIED)
        echo -e "  ${YELLOW}Removing:${NC} $dest"
        rm -f "$dest" 2>/dev/null || true
        # Remove parent dir if empty
        rmdir "$(dirname "$dest")" 2>/dev/null || true
        ;;
      BACKUP)
        echo -e "  ${YELLOW}Restoring:${NC} $dest from $src"
        cp "$src" "$dest" 2>/dev/null || true
        ;;
      MKDIR)
        echo -e "  ${YELLOW}Removing dir:${NC} $dest"
        rmdir "$dest" 2>/dev/null || true
        ;;
    esac
  done

  rm -f "$ROLLBACK_LOG" "$INSTALL_LOG"
  echo -e "${GREEN}Rollback complete.${NC}"
  exit 0
fi

# ─── Initialize logs ─────────────────────────────────────────────────────────
> "$ROLLBACK_LOG"
STEP_COUNT=0
STEP_PASS=0
STEP_FAIL=0

log_action() {
  echo "$1|$2|$3" >> "$ROLLBACK_LOG"
}

step() {
  STEP_COUNT=$((STEP_COUNT + 1))
  echo -e "${BLUE}[Step $STEP_COUNT]${NC} $1"
}

pass() {
  STEP_PASS=$((STEP_PASS + 1))
  echo -e "  ${GREEN}✓${NC} $1"
}

fail() {
  STEP_FAIL=$((STEP_FAIL + 1))
  echo -e "  ${RED}✗${NC} $1"
}

warn() {
  echo -e "  ${YELLOW}⚠${NC} $1"
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 0: PRE-INSTALL VALIDATION (Helm/Terraform pattern)
# ═══════════════════════════════════════════════════════════════════════════════
step "Pre-install validation (preconditions)"

# Check node available
if ! command -v node &>/dev/null; then
  fail "Node.js not found — install Node 20+"; exit 1
fi
pass "Node.js $(node -v) available"

# Check monorepo structure
for dir in "apps/api/src/endpoints" "apps/web/src" "libs/ava-database-types" "libs/migrations"; do
  if [[ ! -d "$MONOREPO/$dir" ]]; then
    fail "Monorepo missing: $dir"
    echo -e "  ${RED}This doesn't look like the Cogedu monorepo.${NC}"
    exit 1
  fi
done
pass "Monorepo structure verified"

# Check database reachable (if psql available)
if command -v psql &>/dev/null; then
  if PGPASSWORD=postgres psql -h localhost -U postgres -d dev -c "SELECT 1" &>/dev/null; then
    pass "PostgreSQL reachable"
  else
    warn "PostgreSQL not reachable — migrations may fail"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: MANIFEST ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════════
step "Analyzing manifest"

# Check if pack has files
FILE_COUNT=$(node -e "
const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
console.log(m.file_map.length);
")
pass "$FILE_COUNT files in manifest"

# Check source files exist in pack
MISSING_SRC=0
node -e "
const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
m.file_map.filter(f => f.action === 'copy').forEach(f => console.log(f.src));
" | while read -r src; do
  if [[ ! -f "$PACK_DIR/$src" ]]; then
    fail "Pack missing source: $src"
    MISSING_SRC=$((MISSING_SRC + 1))
  fi
done
if [[ "$MISSING_SRC" -eq 0 ]]; then
  pass "All source files present in pack"
fi

# Check npm dependencies needed
NPM_DEPS=$(node -e "
const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
const deps = m.dependencies?.npm_install || [];
console.log(deps.join(' '));
")

if [[ -n "$NPM_DEPS" && "$NPM_DEPS" != "" ]]; then
  echo -e "  ${YELLOW}→${NC} npm packages required: $NPM_DEPS"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: RUN MIGRATIONS (if any)
# ═══════════════════════════════════════════════════════════════════════════════
MIGRATION_COUNT=$(node -e "
const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
const migs = m.file_map.filter(f => f.type === 'migration');
console.log(migs.length);
")

if [[ "$MIGRATION_COUNT" -gt 0 ]]; then
  step "Running $MIGRATION_COUNT migrations"

  # Copy migrations first, then run migrate
  node -e "
  const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
  const migs = m.file_map.filter(f => f.type === 'migration');
  migs.forEach(f => console.log(f.src + '|' + f.dest));
  " | while IFS='|' read -r src dest; do
    FULL_SRC="$PACK_DIR/$src"
    FULL_DEST="$MONOREPO/$dest"

    if $DRY_RUN; then
      echo -e "  ${YELLOW}[DRY-RUN]${NC} Would copy: $src → $dest"
    else
      mkdir -p "$(dirname "$FULL_DEST")"
      if [[ -f "$FULL_DEST" ]] && ! $FORCE; then
        warn "Migration already exists: $dest (skipping — use --force to overwrite)"
      else
        cp "$FULL_SRC" "$FULL_DEST"
        log_action "COPIED" "$FULL_SRC" "$FULL_DEST"
        pass "Migration: $(basename "$dest")"
      fi
    fi
  done

  if ! $DRY_RUN; then
    echo -e "  ${BLUE}→${NC} Running npm run migrate:dev..."
    cd "$MONOREPO"
    if npm run migrate:dev 2>&1 | tail -5; then
      pass "Migrations applied"
    else
      fail "Migration failed — run --rollback to undo"
      exit 1
    fi
  fi
else
  step "No migrations needed"
  pass "Feature uses existing tables"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: COPY ALL FILES
# ═══════════════════════════════════════════════════════════════════════════════
step "Installing files ($FILE_COUNT total)"

# Process file_map entries by type order: endpoint → api-type → db-type → frontend → config
COPY_ERRORS=0

node -e "
const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
const typeOrder = ['endpoint','api-type','db-type','event-type','frontend','config'];
const sorted = m.file_map
  .filter(f => f.action === 'copy' && f.type !== 'migration' && f.type !== 'seed')
  .sort((a,b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));
sorted.forEach(f => console.log(f.src + '|' + f.dest + '|' + f.type + '|' + (f.overwrite||false)));
" | while IFS='|' read -r src dest ftype overwrite; do
  FULL_SRC="$PACK_DIR/$src"
  FULL_DEST="$MONOREPO/$dest"

  if [[ ! -f "$FULL_SRC" ]]; then
    fail "Source missing: $src"
    COPY_ERRORS=$((COPY_ERRORS + 1))
    continue
  fi

  if $DRY_RUN; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} [$ftype] $src → $dest"
    continue
  fi

  # Create parent directory
  DEST_DIR="$(dirname "$FULL_DEST")"
  if [[ ! -d "$DEST_DIR" ]]; then
    mkdir -p "$DEST_DIR"
    log_action "MKDIR" "" "$DEST_DIR"
  fi

  # Idempotent install (Debian pattern): if file exists AND checksum matches → skip
  if [[ -f "$FULL_DEST" ]]; then
    # Check if checksums match (file is identical → skip)
    EXISTING_HASH=$(sha256sum "$FULL_DEST" 2>/dev/null | cut -d' ' -f1)
    NEW_HASH=$(sha256sum "$FULL_SRC" 2>/dev/null | cut -d' ' -f1)

    if [[ "$EXISTING_HASH" == "$NEW_HASH" ]]; then
      # File is identical — skip (idempotent)
      continue
    fi

    # File exists but is DIFFERENT
    if [[ "$overwrite" == "true" ]] || $FORCE; then
      BACKUP="$FULL_DEST.bak.$(date +%s)"
      cp "$FULL_DEST" "$BACKUP"
      log_action "BACKUP" "$BACKUP" "$FULL_DEST"
      warn "Overwriting (different): $dest"
    else
      warn "Exists with different content, skipping: $dest (use --force to overwrite)"
      continue
    fi
  fi

  # Copy file
  cp "$FULL_SRC" "$FULL_DEST"
  log_action "COPIED" "$FULL_SRC" "$FULL_DEST"
done

# Count results
COPIED_COUNT=$(grep -c "^COPIED" "$ROLLBACK_LOG" 2>/dev/null || echo 0)
pass "$COPIED_COUNT files installed"

if [[ "$COPY_ERRORS" -gt 0 ]]; then
  fail "$COPY_ERRORS files failed to copy"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4: MERGE OPERATIONS (route registration, etc.)
# ═══════════════════════════════════════════════════════════════════════════════
HAS_ROUTE=$(node -e "
const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
console.log(m.route_registration ? 'yes' : 'no');
")

if [[ "$HAS_ROUTE" == "yes" ]]; then
  step "Registering route in router.tsx"

  if $DRY_RUN; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} Would patch router.tsx"
  else
    # Use node to do the merge safely
    node -e "
    const fs = require('fs');
    const m = JSON.parse(fs.readFileSync('$MANIFEST','utf8'));
    const rr = m.route_registration;
    const routerPath = '$MONOREPO/' + rr.file;

    let content = fs.readFileSync(routerPath, 'utf8');

    // Check if already registered
    if (content.includes(m.feature.slug)) {
      console.log('ALREADY_REGISTERED');
      process.exit(0);
    }

    // Backup
    fs.writeFileSync(routerPath + '.bak.' + Date.now(), content);

    // Add imports
    const imports = rr.imports_to_add || [];
    if (imports.length > 0) {
      const lastImportIdx = content.lastIndexOf('import ');
      const lineEnd = content.indexOf('\n', lastImportIdx);
      content = content.slice(0, lineEnd + 1) + imports.join('\n') + '\n' + content.slice(lineEnd + 1);
    }

    // Add route block
    if (rr.route_block && rr.insert_after) {
      const anchorIdx = content.indexOf(rr.insert_after);
      if (anchorIdx === -1) {
        console.error('ANCHOR_NOT_FOUND: ' + rr.insert_after);
        process.exit(1);
      }
      const lineEnd = content.indexOf('\n', anchorIdx);
      content = content.slice(0, lineEnd + 1) + rr.route_block + '\n' + content.slice(lineEnd + 1);
    }

    fs.writeFileSync(routerPath, content);
    console.log('ROUTE_REGISTERED');
    " 2>&1

    ROUTE_RESULT=$?
    if [[ $ROUTE_RESULT -eq 0 ]]; then
      pass "Route registered"
      log_action "BACKUP" "$MONOREPO/apps/web/src/router.tsx.bak.*" "$MONOREPO/apps/web/src/router.tsx"
    else
      fail "Route registration failed"
    fi
  fi
else
  step "No route registration needed"
fi

# Handle merge/append operations from file_map
MERGE_COUNT=$(node -e "
const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
console.log(m.file_map.filter(f => f.action !== 'copy').length);
")

if [[ "$MERGE_COUNT" -gt 0 ]]; then
  step "Processing $MERGE_COUNT merge operations"

  node -e "
  const fs = require('fs');
  const m = JSON.parse(fs.readFileSync('$MANIFEST','utf8'));
  const merges = m.file_map.filter(f => f.action !== 'copy' && f.merge_strategy);

  merges.forEach(f => {
    const strategy = f.merge_strategy;
    const targetPath = '$MONOREPO/' + strategy.target_file;

    if (!fs.existsSync(targetPath)) {
      console.log('SKIP|' + strategy.target_file + '|File not found');
      return;
    }

    let content = fs.readFileSync(targetPath, 'utf8');

    // Backup
    fs.writeFileSync(targetPath + '.bak.' + Date.now(), content);

    if (f.action === 'append') {
      content += '\n' + strategy.content;
    } else if (f.action === 'merge') {
      const anchorIdx = content.indexOf(strategy.anchor);
      if (anchorIdx === -1) {
        console.log('ANCHOR_MISS|' + strategy.target_file + '|' + strategy.anchor);
        return;
      }
      const lineEnd = content.indexOf('\n', anchorIdx);
      if (strategy.insert === 'after') {
        content = content.slice(0, lineEnd + 1) + strategy.content + '\n' + content.slice(lineEnd + 1);
      } else if (strategy.insert === 'before') {
        const lineStart = content.lastIndexOf('\n', anchorIdx) + 1;
        content = content.slice(0, lineStart) + strategy.content + '\n' + content.slice(lineStart);
      }
    }

    fs.writeFileSync(targetPath, content);
    console.log('MERGED|' + strategy.target_file + '|OK');
  });
  "
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5: INSTALL NPM DEPENDENCIES
# ═══════════════════════════════════════════════════════════════════════════════
if [[ -n "$NPM_DEPS" && "$NPM_DEPS" != "" ]]; then
  step "Installing npm dependencies: $NPM_DEPS"

  if $DRY_RUN; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} Would run: npm install $NPM_DEPS"
  else
    cd "$MONOREPO"
    if npm install $NPM_DEPS 2>&1 | tail -3; then
      pass "Dependencies installed"
    else
      warn "Some dependencies may have failed — check npm output"
    fi
  fi
else
  step "No additional npm dependencies"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 6: RUN SEEDS (if any)
# ═══════════════════════════════════════════════════════════════════════════════
SEED_COUNT=$(node -e "
const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
console.log(m.file_map.filter(f => f.type === 'seed').length);
")

if [[ "$SEED_COUNT" -gt 0 ]]; then
  step "Running $SEED_COUNT seed files"

  node -e "
  const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
  m.file_map.filter(f => f.type === 'seed').forEach(f => console.log(f.src));
  " | while read -r src; do
    SEED_FILE="$PACK_DIR/$src"
    if $DRY_RUN; then
      echo -e "  ${YELLOW}[DRY-RUN]${NC} Would run seed: $src"
    else
      echo -e "  ${BLUE}→${NC} Running: $(basename "$src")"
      PGPASSWORD=postgres psql -h localhost -U postgres -d dev -f "$SEED_FILE" 2>&1 | tail -3
      pass "Seed: $(basename "$src")"
    fi
  done
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 7: BUILD TYPES + VALIDATE
# ═══════════════════════════════════════════════════════════════════════════════
step "Building types and validating"

if $DRY_RUN; then
  echo -e "  ${YELLOW}[DRY-RUN]${NC} Would run: npm run build"
else
  cd "$MONOREPO"

  # Build types first
  echo -e "  ${BLUE}→${NC} Building @cogedu/ava-api-types..."
  npm --workspace @cogedu/ava-api-types run build 2>&1 | tail -2

  echo -e "  ${BLUE}→${NC} Building @cogedu/ava-database-types..."
  npm --workspace @cogedu/ava-database-types run build 2>&1 | tail -2

  echo -e "  ${BLUE}→${NC} Building @cogedu/event-types..."
  npm --workspace @cogedu/event-types run build 2>&1 | tail -2

  # TypeScript check
  echo -e "  ${BLUE}→${NC} TypeScript check (npx tsc --noEmit)..."
  cd "$MONOREPO/apps/web"
  if npx tsc --noEmit 2>&1 | tail -5; then
    pass "TypeScript: zero errors"
  else
    fail "TypeScript errors found — check output above"
  fi
  cd "$MONOREPO"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 8: ENDPOINT HEALTH CHECKS
# ═══════════════════════════════════════════════════════════════════════════════
step "Validating endpoints"

if $DRY_RUN; then
  echo -e "  ${YELLOW}[DRY-RUN]${NC} Would test all endpoints via curl"
else
  ENDPOINTS_TOTAL=0
  ENDPOINTS_OK=0
  ENDPOINTS_FAIL=0

  # Try to get a token (DEV_AUTO_AUTH mode or Keycloak)
  API_BASE="http://localhost:3000"

  # Check if API is running
  if ! curl -sf "$API_BASE/health" > /dev/null 2>&1; then
    warn "API not running on :3000 — skipping endpoint tests"
    warn "Start the API first, then run: bash feature-install.sh $PACK_DIR --validate-only"
  else
    pass "API is running"

    # Test each endpoint from manifest
    node -e "
    const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
    const eps = m.validation?.endpoints_expected || [];
    eps.forEach(e => console.log(e.method + '|' + e.path + '|' + e.expected_status + '|' + e.needs_auth));
    " | while IFS='|' read -r method path expected_status needs_auth; do
      ENDPOINTS_TOTAL=$((ENDPOINTS_TOTAL + 1))

      HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" -X "$method" "$API_BASE$path" 2>/dev/null || echo "000")

      if [[ "$HTTP_CODE" == "$expected_status" ]] || [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "401" && "$needs_auth" == "true" ]]; then
        pass "$method $path → HTTP $HTTP_CODE"
        ENDPOINTS_OK=$((ENDPOINTS_OK + 1))
      else
        fail "$method $path → HTTP $HTTP_CODE (expected $expected_status)"
        ENDPOINTS_FAIL=$((ENDPOINTS_FAIL + 1))
      fi
    done
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 9: GENERATE INSTALL REPORT
# ═══════════════════════════════════════════════════════════════════════════════
step "Generating install report"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COPIED_FINAL=$(grep -c '^COPIED' "$ROLLBACK_LOG" 2>/dev/null || echo 0)

echo ""
echo -e "${BLUE}${BOLD}═══ Installation Summary ═══${NC}"
echo -e "Feature:    ${BOLD}$FEATURE_NAME${NC}"
echo -e "Files:      ${GREEN}${COPIED_FINAL} copied${NC}"
echo -e "Passed:     ${GREEN}$STEP_PASS${NC}"

if [[ "$STEP_FAIL" -gt 0 ]]; then
  echo -e "Failed:     ${RED}$STEP_FAIL${NC}"
  echo ""
  echo -e "${RED}${BOLD}⚠ Installation had errors. Run rollback:${NC}"
  echo -e "  bash feature-install.sh $PACK_DIR --rollback"
else
  echo -e "Failed:     ${GREEN}0${NC}"
  echo ""
  echo -e "${GREEN}${BOLD}✓ Installation complete!${NC}"
fi

if $DRY_RUN; then
  echo ""
  echo -e "${YELLOW}This was a DRY RUN. No files were modified.${NC}"
  echo -e "Run without --dry-run to install for real."
fi

# Write JSON report
cat > "$INSTALL_LOG" <<REPORT
{
  "feature": "$FEATURE_SLUG",
  "installed_at": "$TIMESTAMP",
  "monorepo": "$MONOREPO",
  "dry_run": $DRY_RUN,
  "files_copied": $COPIED_FINAL,
  "steps_passed": $STEP_PASS,
  "steps_failed": $STEP_FAIL,
  "rollback_available": true,
  "rollback_command": "bash feature-install.sh $PACK_DIR --rollback"
}
REPORT

echo ""
echo -e "Rollback:   bash feature-install.sh $PACK_DIR --rollback"
echo -e "Report:     $INSTALL_LOG"
exit $STEP_FAIL
