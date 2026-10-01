#!/usr/bin/env bash

set -euo pipefail

SOURCE=$1
REF=$2
SHA=$3
D8_DIR=$4

UPSTREAM_URL="https://chromium.googlesource.com/v8/v8.git"
DEPOT_TOOLS_URL="https://chromium.googlesource.com/chromium/tools/depot_tools.git"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORK_URL="$(git config -f .gitmodules submodule.v8.url)"
GN_ARGS="$(sed -n "s/^GN_ARGS='\(.*\)'\$/\1/p" scripts/build-d8.sh)"
if [ -z "$GN_ARGS" ]; then
  echo "could not read GN_ARGS from scripts/build-d8.sh" >&2
  exit 1
fi

git submodule update --init --depth 1 v8

cd v8
REMOTE=origin
if [ "$SOURCE" = "upstream" ]; then
  git remote remove upstream 2>/dev/null || true
  git remote add upstream "$UPSTREAM_URL"
  REMOTE=upstream
fi
git fetch --depth 1 "$REMOTE" "$REF"
git checkout --force "$SHA"
cd "$ROOT"

if [ ! -d "$ROOT/.depot_tools" ]; then
  git clone --depth 1 "$DEPOT_TOOLS_URL" "$ROOT/.depot_tools"
fi
export PATH="$ROOT/.depot_tools:$PATH"
export DEPOT_TOOLS_UPDATE=0
export DEPOT_TOOLS_METRICS=0

cat > "$ROOT/.gclient" <<EOF
solutions = [
  {
    "name": "v8",
    "url": "$FORK_URL",
    "deps_file": "DEPS",
    "managed": False,
    "custom_deps": {},
  },
]
EOF

gclient sync --no-history -j"$(nproc)"

cd "$ROOT/v8"
buildtools/linux64/gn gen out/release --args="$GN_ARGS"
third_party/ninja/ninja -C out/release v8_dump_build_config

for data_file in d8 snapshot_blob.bin icudtl.dat; do
  if [ -f "$D8_DIR/$data_file" ]; then
    cp "$D8_DIR/$data_file" out/release/
  fi
done
chmod +x out/release/d8

out/release/d8 -e 'print(version())'
