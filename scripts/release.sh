#!/bin/sh
# Cut a release: bump version in all three package.json files (root, client,
# server) + their lockfiles, create one commit and a v<semver> tag.
#
# Usage:
#   npm run release -- 2.2.0           # explicit semver
#   npm run release -- 2.2.0-rc.1      # prerelease
#   npm run release -- prerelease      # bump 2.1.0-rc.1 -> 2.1.0-rc.2
#
# Nothing is pushed — review the commit, then:
#   git push && git push origin v<version>
# Pushing the tag triggers the docker-publish and desktop-release workflows.

set -e

cd "$(dirname "$0")/.."

V="${1:?usage: npm run release -- <version|patch|minor|major|prerelease|prepatch|preminor|premajor>}"

if [ -n "$(git status --porcelain -- package.json client/package.json server/package.json)" ]; then
  echo "error: package.json files have uncommitted changes" >&2
  exit 1
fi

# Resolve the bump keyword to an explicit version using the root package first,
# so all three files land on the same number.
npm version "$V" --no-git-tag-version >/dev/null
RESOLVED="$(node -p "require('./package.json').version")"

(cd client && npm version "$RESOLVED" --no-git-tag-version --allow-same-version >/dev/null)
(cd server && npm version "$RESOLVED" --no-git-tag-version --allow-same-version >/dev/null)

git add package.json package-lock.json \
        client/package.json client/package-lock.json \
        server/package.json server/package-lock.json
git commit -m "chore(release): v$RESOLVED"
git tag "v$RESOLVED"

echo "Done. Version is now $RESOLVED."
echo "Push with: git push && git push origin v$RESOLVED"
