#!/bin/bash

# Run all k6 load tests
# Usage: ./run-all-tests.sh [scenario]
# Example: ./run-all-tests.sh medium

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
SCENARIO=${1:-light}
RESULTS_DIR="./load-test-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Running k6 Load Tests${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Scenario: ${YELLOW}${SCENARIO}${NC}"
echo -e "Timestamp: ${YELLOW}${TIMESTAMP}${NC}"
echo ""

# Create results directory
mkdir -p "$RESULTS_DIR"

# Check if AUTH_TOKEN is set
if [ -z "$AUTH_TOKEN" ]; then
    echo -e "${RED}Warning: AUTH_TOKEN not set. Some tests may fail.${NC}"
    echo "Set it with: export AUTH_TOKEN='your-token'"
    echo ""
fi

# Array of test files
tests=(
    "health-check-load.test.js"
    "auth-load.test.js"
    "settings-load.test.js"
    "dashboard-load.test.js"
    "wallets-tokens-load.test.js"
    "campaigns-load.test.js"
    "mixed-scenario-load.test.js"
)

# Track test results
total_tests=${#tests[@]}
passed_tests=0
failed_tests=0

echo -e "${GREEN}Running ${total_tests} test suites...${NC}"
echo ""

# Run each test
for test in "${tests[@]}"; do
    echo -e "${YELLOW}Running: ${test}${NC}"

    output_file="$RESULTS_DIR/${test%.js}_${TIMESTAMP}.json"

    if k6 run \
        -e SCENARIO="$SCENARIO" \
        -e AUTH_TOKEN="$AUTH_TOKEN" \
        -e API_URL="${API_URL:-http://localhost:3001}" \
        --out json="$output_file" \
        "backend/api/tests/load/$test"; then

        echo -e "${GREEN}✓ ${test} passed${NC}"
        ((passed_tests++))
    else
        echo -e "${RED}✗ ${test} failed${NC}"
        ((failed_tests++))
    fi

    echo ""
    sleep 2  # Brief pause between tests
done

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Test Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Total tests:  ${total_tests}"
echo -e "Passed:       ${GREEN}${passed_tests}${NC}"
echo -e "Failed:       ${RED}${failed_tests}${NC}"
echo ""
echo -e "Results saved to: ${YELLOW}${RESULTS_DIR}${NC}"

# Generate summary report
summary_file="$RESULTS_DIR/summary_${TIMESTAMP}.txt"
cat > "$summary_file" << EOF
Load Test Summary
=================
Date: $(date)
Scenario: $SCENARIO
Total Tests: $total_tests
Passed: $passed_tests
Failed: $failed_tests

Test Results:
EOF

for test in "${tests[@]}"; do
    echo "  - $test" >> "$summary_file"
done

echo ""
echo -e "Summary report: ${YELLOW}${summary_file}${NC}"

# Exit with error if any tests failed
if [ $failed_tests -gt 0 ]; then
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
