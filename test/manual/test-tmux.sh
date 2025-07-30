#!/bin/bash

# Manual test script for tmux integration
# Run this script to verify tmux functionality

set -e

echo "=== Manual Tmux Integration Test ==="
echo

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test directory
TEST_DIR="/tmp/wtt-tmux-test-$$"
WTT_BIN="$(pwd)/dist/index.js"

# Check if wtt is built
if [ ! -f "$WTT_BIN" ]; then
  echo -e "${RED}Error: wtt not built. Run 'npm run build' first.${NC}"
  exit 1
fi

# Check if tmux is available
if ! command -v tmux &> /dev/null; then
  echo -e "${RED}Error: tmux not installed${NC}"
  exit 1
fi

# Kill any existing test sessions
tmux kill-session -t wtt-test-project 2>/dev/null || true

echo "Creating test directory: $TEST_DIR"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Initialize git repo
echo -e "${YELLOW}1. Initializing git repository...${NC}"
git init
git config user.email "test@example.com"
git config user.name "Test User"
echo "# Test Project" > README.md
git add README.md
git commit -m "Initial commit"

# Initialize wtt with tmux
echo -e "${YELLOW}2. Initializing wtt with tmux enabled...${NC}"
cat > .worktree-config.json << EOF
{
  "version": "1.0.0",
  "projectName": "wtt-test-project",
  "mainBranch": "main",
  "baseDir": ".worktrees",
  "tmux": true
}
EOF

# Test 1: Create first worktree (should create session)
echo -e "${YELLOW}3. Creating first worktree (should create tmux session)...${NC}"
echo "Running: node \"$WTT_BIN\" create feature-one"
node "$WTT_BIN" create feature-one 2>&1 | tee /tmp/wtt-test-output-1.log

# Check if session was created
if tmux has-session -t wtt-test-project 2>/dev/null; then
  echo -e "${GREEN}✓ Tmux session 'wtt-test-project' created${NC}"
else
  echo -e "${RED}✗ Tmux session not created${NC}"
  exit 1
fi

# Check window name and path
WINDOW_INFO=$(tmux list-windows -t wtt-test-project -F "#{window_name}:#{pane_current_path}")
echo "Window info: $WINDOW_INFO"

if echo "$WINDOW_INFO" | grep -q "feature-one.*\.worktrees/feature-one"; then
  echo -e "${GREEN}✓ Window 'feature-one' created in correct directory${NC}"
else
  echo -e "${RED}✗ Window not in correct directory${NC}"
  echo "Expected: feature-one in .worktrees/feature-one"
  echo "Got: $WINDOW_INFO"
fi

# Test 2: Create second worktree (should add window)
echo
echo -e "${YELLOW}4. Creating second worktree (should add window to existing session)...${NC}"
node "$WTT_BIN" create feature-two 2>&1 | tee /tmp/wtt-test-output-2.log

# Check window count
WINDOW_COUNT=$(tmux list-windows -t wtt-test-project | wc -l)
if [ "$WINDOW_COUNT" -eq 2 ]; then
  echo -e "${GREEN}✓ Two windows exist in session${NC}"
else
  echo -e "${RED}✗ Expected 2 windows, got $WINDOW_COUNT${NC}"
fi

# Test 3: Test inside tmux (should switch, not attach)
echo
echo -e "${YELLOW}5. Testing behavior inside tmux...${NC}"
tmux new-session -d -s test-runner -c "$TEST_DIR"
tmux send-keys -t test-runner "cd $TEST_DIR && node \"$WTT_BIN\" create feature-three 2>&1 | tee /tmp/wtt-test-output-3.log" Enter
sleep 2

# Check if third window was created
WINDOW_COUNT=$(tmux list-windows -t wtt-test-project | wc -l)
if [ "$WINDOW_COUNT" -eq 3 ]; then
  echo -e "${GREEN}✓ Third window created from inside tmux${NC}"
else
  echo -e "${RED}✗ Expected 3 windows, got $WINDOW_COUNT${NC}"
fi

# Clean up test runner
tmux kill-session -t test-runner 2>/dev/null || true

# Test 4: Verify no extra windows in home/root
echo
echo -e "${YELLOW}6. Verifying no windows in home or root directory...${NC}"
WINDOW_PATHS=$(tmux list-windows -t wtt-test-project -F "#{pane_current_path}")
BAD_PATHS=0

while IFS= read -r path; do
  if [ "$path" = "$HOME" ] || [ "$path" = "/" ] || [ "$path" = "$TEST_DIR" ]; then
    echo -e "${RED}✗ Found window in unexpected directory: $path${NC}"
    BAD_PATHS=$((BAD_PATHS + 1))
  fi
done <<< "$WINDOW_PATHS"

if [ "$BAD_PATHS" -eq 0 ]; then
  echo -e "${GREEN}✓ All windows are in worktree directories${NC}"
fi

# Summary
echo
echo "=== Test Summary ==="
tmux list-windows -t wtt-test-project -F "Window: #{window_name} Path: #{pane_current_path}"

# Cleanup
echo
echo -e "${YELLOW}Cleaning up...${NC}"
tmux kill-session -t wtt-test-project 2>/dev/null || true
cd /
rm -rf "$TEST_DIR"

echo -e "${GREEN}✓ Manual tmux tests completed${NC}"
echo
echo "Test output logs saved to:"
echo "  - /tmp/wtt-test-output-1.log"
echo "  - /tmp/wtt-test-output-2.log"
echo "  - /tmp/wtt-test-output-3.log"