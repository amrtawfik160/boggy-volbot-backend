#!/bin/bash

# Validate k6 test scripts for syntax errors
# This script checks all test files without running them

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Validating k6 test scripts..."
echo ""

tests=(
    "health-check-load.test.js"
    "auth-load.test.js"
    "settings-load.test.js"
    "dashboard-load.test.js"
    "wallets-tokens-load.test.js"
    "campaigns-load.test.js"
    "mixed-scenario-load.test.js"
)

valid=0
invalid=0

for test in "${tests[@]}"; do
    if k6 inspect "backend/api/tests/load/$test" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $test"
        ((valid++))
    else
        echo -e "${RED}✗${NC} $test"
        ((invalid++))
    fi
done

echo ""
echo "Valid: $valid"
echo "Invalid: $invalid"

if [ $invalid -gt 0 ]; then
    exit 1
fi
