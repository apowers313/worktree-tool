#!/bin/bash

# Setup test environment
echo "Setting up test environment for wtt exec..."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Create a test directory
TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

echo "Test directory: $TEST_DIR"

# Initialize git repo
git init
git config user.email "test@example.com"
git config user.name "Test User"

# Create initial files
echo "# Test Project" > README.md
echo "console.log('Hello');" > index.js
echo '{"name": "test-project", "scripts": {"test": "echo Testing...", "build": "echo Building..."}}' > package.json

git add .
git commit -m "Initial commit"

# Create test config
cat > .worktree-config.json << EOF
{
  "version": "1.0.0",
  "projectName": "exec-test",
  "mainBranch": "main",
  "baseDir": ".worktrees",
  "tmux": true,
  "commands": {
    "echo": "echo 'Hello from worktree'",
    "pwd": "pwd",
    "longrun": "sleep 5 && echo 'Done after 5 seconds'",
    "special": "echo 'Test' | grep 'T' && ls -la",
    "env": "echo \"Worktree: \$WTT_WORKTREE_NAME, Path: \$WTT_WORKTREE_PATH, Main: \$WTT_IS_MAIN\"",
    "test": "npm test",
    "build": "npm run build"
  }
}
EOF

# Create some worktrees
echo -e "${GREEN}Creating worktrees...${NC}"
git worktree add .worktrees/feature-a -b feature-a
git worktree add .worktrees/feature-b -b feature-b

# Build wtt if needed
WTT_PATH="$(dirname "$0")/../../dist/index.js"
if [ ! -f "$WTT_PATH" ]; then
    echo -e "${RED}wtt not built. Run 'npm run build' first.${NC}"
    exit 1
fi

# Test scenarios
echo -e "\n${GREEN}1. Testing basic command execution in all worktrees...${NC}"
echo "(This will only execute in .worktrees/*, not in the main worktree)"
node "$WTT_PATH" exec echo
sleep 2

echo -e "\n${GREEN}2. Testing command with current directory...${NC}"
node "$WTT_PATH" exec pwd
sleep 2

echo -e "\n${GREEN}3. Testing long-running command...${NC}"
echo "This will take 5 seconds per worktree..."
node "$WTT_PATH" exec longrun
sleep 2

echo -e "\n${GREEN}4. Testing special characters...${NC}"
node "$WTT_PATH" exec special
sleep 2

echo -e "\n${GREEN}5. Testing environment variables...${NC}"
node "$WTT_PATH" exec env
sleep 2

echo -e "\n${GREEN}6. Testing specific worktree execution...${NC}"
node "$WTT_PATH" exec echo main
sleep 1
node "$WTT_PATH" exec echo feature-a
sleep 1
node "$WTT_PATH" exec echo feature-b
sleep 2

echo -e "\n${GREEN}7. Testing npm scripts...${NC}"
node "$WTT_PATH" exec test
sleep 1
node "$WTT_PATH" exec build
sleep 2

echo -e "\n${GREEN}8. Testing invalid command (should show error)...${NC}"
node "$WTT_PATH" exec nonexistent || echo -e "${GREEN}Error handling works!${NC}"

echo -e "\n${GREEN}9. Testing invalid worktree (should show error)...${NC}"
node "$WTT_PATH" exec echo fakeworktree || echo -e "${GREEN}Error handling works!${NC}"

echo -e "\n${GREEN}10. Testing with verbose flag...${NC}"
node "$WTT_PATH" exec echo --verbose

echo -e "\n${GREEN}11. Testing with quiet flag...${NC}"
node "$WTT_PATH" exec echo --quiet

echo -e "\n${GREEN}12. Testing session persistence (running exec again)...${NC}"
echo "This should reuse the existing tmux session 'exec-test'"
node "$WTT_PATH" exec pwd
sleep 2

echo -e "\n${GREEN}Manual test complete!${NC}"
echo -e "Test directory: $TEST_DIR"
echo -e "To clean up: rm -rf $TEST_DIR"

# If running in tmux, show the windows
if [ -n "$TMUX" ]; then
    echo -e "\n${GREEN}Tmux session and windows created:${NC}"
    echo "Session: exec-test"
    tmux list-windows -t exec-test || echo "Session 'exec-test' not found"
    echo -e "\n${GREEN}All tmux sessions:${NC}"
    tmux list-sessions
fi