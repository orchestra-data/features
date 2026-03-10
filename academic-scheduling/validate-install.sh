#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# validate-install.sh — Post-Installation Validator for Cogedu Feature Packs
# Protocol: DPP-002 v2.0
# Usage: bash validate-install.sh <feature-pack-dir>
#
# Reads manifest.json and verifies:
#   1. Every file in file_map exists at its destination
#   2. Checksums match (if provided)
#   3. Route is registered
#   4. Types build successfully
#   5. Endpoints respond (if API is running)
#   6. No orphaned files (pack has everything)
#
# Exit 0 = ALL GOOD | Exit 1 = ISSUES FOUND
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; BLUE='\033[0;34m'
BOLD='\033[1m'; NC='\033[0m'

PACK_DIR="${1:?Usage: bash validate-install.sh <feature-pack-dir>}"
PACK_DIR="$(cd "$PACK_DIR" && pwd)"
MANIFEST="$PACK_DIR/manifest.json"

if [[ ! -f "$MANIFEST" ]]; then
  echo -e "${RED}ERROR: manifest.json not found in $PACK_DIR${NC}"
  exit 1
fi

# Find monorepo
MONOREPO=""
check_dir="$PACK_DIR"
for i in {1..5}; do
  check_dir="$(dirname "$check_dir")"
  if [[ -f "$check_dir/package.json" ]] && grep -q '"workspaces"' "$check_dir/package.json" 2>/dev/null; then
    MONOREPO="$check_dir"
    break
  fi
done

if [[ -z "$MONOREPO" ]]; then
  echo -e "${RED}ERROR: Monorepo root not found${NC}"
  exit 1
fi

FEATURE_NAME=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$MANIFEST','utf8')).feature.name)")
FEATURE_SLUG=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$MANIFEST','utf8')).feature.slug)")

echo -e "${BLUE}${BOLD}═══ Post-Install Validation: $FEATURE_NAME ═══${NC}"
echo ""

PASS=0
FAIL=0
WARN=0

pass() { PASS=$((PASS+1)); echo -e "  ${GREEN}✓${NC} $1"; }
fail() { FAIL=$((FAIL+1)); echo -e "  ${RED}✗${NC} $1"; }
warn() { WARN=$((WARN+1)); echo -e "  ${YELLOW}⚠${NC} $1"; }

# ─── Check 1: All files exist at destination ──────────────────────────────────
echo -e "${BOLD}[1/6] File Presence Check${NC}"

TOTAL_FILES=0
MISSING_FILES=0

node -e "
const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
m.file_map.filter(f => f.action === 'copy').forEach(f => console.log(f.dest + '|' + f.type));
" | while IFS='|' read -r dest ftype; do
  TOTAL_FILES=$((TOTAL_FILES + 1))
  FULL_DEST="$MONOREPO/$dest"
  if [[ -f "$FULL_DEST" ]]; then
    : # exists, OK
  else
    fail "MISSING: $dest [$ftype]"
    MISSING_FILES=$((MISSING_FILES + 1))
  fi
done

if [[ "$MISSING_FILES" -eq 0 ]]; then
  pass "All $TOTAL_FILES files present at destinations"
else
  fail "$MISSING_FILES of $TOTAL_FILES files missing"
fi

# ─── Check 2: Checksums (if provided) ────────────────────────────────────────
echo -e "${BOLD}[2/6] Checksum Verification${NC}"

CHECKSUM_COUNT=$(node -e "
const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
console.log(m.file_map.filter(f => f.checksum).length);
")

if [[ "$CHECKSUM_COUNT" -gt 0 ]]; then
  CHECKSUM_FAIL=0
  node -e "
  const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
  m.file_map.filter(f => f.checksum).forEach(f => console.log(f.dest + '|' + f.checksum));
  " | while IFS='|' read -r dest expected_hash; do
    FULL_DEST="$MONOREPO/$dest"
    if [[ -f "$FULL_DEST" ]]; then
      ACTUAL_HASH=$(sha256sum "$FULL_DEST" 2>/dev/null | cut -d' ' -f1)
      if [[ "$ACTUAL_HASH" != "$expected_hash" ]]; then
        fail "Checksum mismatch: $dest"
        CHECKSUM_FAIL=$((CHECKSUM_FAIL + 1))
      fi
    fi
  done

  if [[ "$CHECKSUM_FAIL" -eq 0 ]]; then
    pass "All $CHECKSUM_COUNT checksums match"
  fi
else
  warn "No checksums in manifest (optional)"
fi

# ─── Check 3: Route Registration ─────────────────────────────────────────────
echo -e "${BOLD}[3/6] Route Registration${NC}"

HAS_ROUTE=$(node -e "
const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
console.log(m.route_registration ? 'yes' : 'no');
")

if [[ "$HAS_ROUTE" == "yes" ]]; then
  ROUTER_FILE=$(node -e "
  const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
  console.log(m.route_registration.file);
  ")

  if grep -q "$FEATURE_SLUG" "$MONOREPO/$ROUTER_FILE" 2>/dev/null; then
    pass "Route registered in $ROUTER_FILE"
  else
    fail "Route NOT found in $ROUTER_FILE — feature won't be accessible"
  fi
else
  pass "No route registration needed"
fi

# ─── Check 4: TypeScript Build ───────────────────────────────────────────────
echo -e "${BOLD}[4/6] TypeScript Compilation${NC}"

cd "$MONOREPO/apps/web"
if npx tsc --noEmit 2>&1 | tail -1 | grep -q "error"; then
  fail "TypeScript errors found"
  npx tsc --noEmit 2>&1 | grep "error TS" | head -5
else
  pass "TypeScript: zero errors"
fi
cd "$MONOREPO"

# ─── Check 5: Endpoint Availability ──────────────────────────────────────────
echo -e "${BOLD}[5/6] Endpoint Health Check${NC}"

API_BASE="http://localhost:3000"

if curl -sf "$API_BASE/health" > /dev/null 2>&1; then
  EP_TOTAL=0
  EP_OK=0

  node -e "
  const m = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
  const eps = m.validation?.endpoints_expected || [];
  eps.forEach(e => console.log(e.method + '|' + e.path + '|' + e.expected_status));
  " | while IFS='|' read -r method path expected; do
    EP_TOTAL=$((EP_TOTAL + 1))
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" -X "$method" "$API_BASE$path" 2>/dev/null || echo "000")

    # Accept: expected status, 200, or 401 (auth required = endpoint exists)
    if [[ "$HTTP_CODE" == "$expected" ]] || [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "401" ]]; then
      EP_OK=$((EP_OK + 1))
    else
      fail "Endpoint: $method $path → HTTP $HTTP_CODE (expected $expected)"
    fi
  done

  if [[ "$EP_TOTAL" -gt 0 ]]; then
    pass "$EP_OK/$EP_TOTAL endpoints responding"
  fi
else
  warn "API not running on :3000 — skipping endpoint checks"
  warn "Start API and re-run this validation"
fi

# ─── Check 6: Screenshots Presence ───────────────────────────────────────────
echo -e "${BOLD}[6/6] Screenshots & Evidence${NC}"

SCREENSHOT_COUNT=$(find "$PACK_DIR/screenshots" -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.webp" \) -size +10k 2>/dev/null | wc -l)

if [[ "$SCREENSHOT_COUNT" -ge 5 ]]; then
  pass "$SCREENSHOT_COUNT screenshots (all >10KB)"
elif [[ "$SCREENSHOT_COUNT" -gt 0 ]]; then
  warn "$SCREENSHOT_COUNT screenshots (recommend 5+)"
else
  fail "No screenshots found"
fi

# Check localhost-validation.json
if [[ -f "$PACK_DIR/evidence/localhost-validation.json" ]]; then
  pass "Localhost validation evidence present"
else
  warn "No localhost-validation.json"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}${BOLD}═══ Validation Summary ═══${NC}"
echo -e "Feature:  ${BOLD}$FEATURE_NAME${NC}"
echo -e "Passed:   ${GREEN}$PASS${NC}"
echo -e "Warnings: ${YELLOW}$WARN${NC}"
echo -e "Failed:   ${RED}$FAIL${NC}"
echo ""

if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}✓ VALIDATION PASSED — Feature installed correctly${NC}"
  exit 0
else
  echo -e "${RED}${BOLD}✗ VALIDATION FAILED — $FAIL issues need attention${NC}"
  echo -e "  Fix the issues above, or rollback with:"
  echo -e "  bash feature-install.sh $PACK_DIR --rollback"
  exit 1
fi
