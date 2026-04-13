#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/release.sh <patch|minor|major> or ./scripts/release.sh <version>
# Examples:
#   ./scripts/release.sh patch    # 1.3.1 -> 1.3.2
#   ./scripts/release.sh minor    # 1.3.1 -> 1.4.0
#   ./scripts/release.sh major    # 1.3.1 -> 2.0.0
#   ./scripts/release.sh 1.5.0   # explicit version

BUMP="${1:-patch}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Get current version from frontend/package.json
CURRENT=$(node -p "require('$ROOT/frontend/package.json').version")
echo "Current version: $CURRENT"

# Calculate new version
if [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW="$BUMP"
else
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  case "$BUMP" in
    major) NEW="$((MAJOR + 1)).0.0" ;;
    minor) NEW="$MAJOR.$((MINOR + 1)).0" ;;
    patch) NEW="$MAJOR.$MINOR.$((PATCH + 1))" ;;
    *) echo "Usage: $0 <patch|minor|major|x.y.z>"; exit 1 ;;
  esac
fi

echo "New version: $NEW"

# Ensure working tree is clean
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree is not clean. Commit or stash changes first."
  exit 1
fi

# Update version in package.json files
cd "$ROOT/frontend" && npm version "$NEW" --no-git-tag-version
cd "$ROOT/backend" && npm version "$NEW" --no-git-tag-version

# Update CHANGELOG: replace [Unreleased] with version + date
TODAY=$(date +%Y-%m-%d)
cd "$ROOT"
if grep -q '\[Unreleased\]' CHANGELOG.md; then
  sed -i "s/## \[Unreleased\]/## [$NEW] - $TODAY/" CHANGELOG.md
  echo "Updated CHANGELOG.md: [Unreleased] -> [$NEW] - $TODAY"
else
  echo "Note: No [Unreleased] section found in CHANGELOG.md"
fi

# Run checks
echo "Running checks..."
cd "$ROOT/frontend" && npx tsc --noEmit && npm run lint && npm test
cd "$ROOT/backend" && npx tsc --noEmit && npm run lint && npm test
echo "All checks passed."

# Commit, tag, push
cd "$ROOT"
git add frontend/package.json backend/package.json CHANGELOG.md
git commit -m "Release v$NEW"
git tag "v$NEW"
git push && git push --tags

echo ""
echo "Released v$NEW successfully!"
echo "Docker image will be built automatically via GitHub Actions."
