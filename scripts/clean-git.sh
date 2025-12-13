#!/bin/bash

# Clean up Git repository - remove tracked files that should be ignored

echo "🧹 Cleaning up Git repository..."

# Remove node_modules from Git if they were tracked
echo "Removing node_modules from Git tracking..."
git rm -r --cached node_modules/ 2>/dev/null || true
git rm -r --cached packages/*/node_modules/ 2>/dev/null || true
git rm -r --cached **/node_modules/ 2>/dev/null || true

# Remove Prisma generated files
echo "Removing Prisma generated files from Git tracking..."
git rm -r --cached node_modules/.prisma/ 2>/dev/null || true
git rm -r --cached **/.prisma/ 2>/dev/null || true

# Remove build outputs
echo "Removing build outputs from Git tracking..."
git rm -r --cached dist/ 2>/dev/null || true
git rm -r --cached build/ 2>/dev/null || true
git rm -r --cached packages/*/dist/ 2>/dev/null || true
git rm -r --cached packages/*/build/ 2>/dev/null || true

# Remove .env files
echo "Removing .env files from Git tracking..."
git rm --cached packages/server/.env 2>/dev/null || true
git rm --cached packages/client/.env 2>/dev/null || true
git rm --cached .env 2>/dev/null || true

# Remove log files
echo "Removing log files from Git tracking..."
git rm --cached *.log 2>/dev/null || true
git rm -r --cached logs/ 2>/dev/null || true

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📊 Current status:"
git status --short | head -20

echo ""
echo "💡 Next steps:"
echo "   1. Review the changes: git status"
echo "   2. Stage the .gitignore: git add .gitignore"
echo "   3. Commit the cleanup: git commit -m 'chore: update .gitignore and remove tracked files'"
echo ""
