#!/usr/bin/env bash
# Build a release arm64 d8 for one resolved V8 version inside the v8
# submodule.
#
# Usage:
#   scripts/build-d8.sh <source> <ref> <sha> <output-dir>
#     source      "origin" (the fork, i.e. the submodule remote) or "upstream"
#                 (chromium.googlesource.com/v8/v8)
#     ref         fully qualified ref (refs/tags/15.1.99, refs/heads/main) or
#                 a 40-hex commit sha
#     sha         commit sha the ref resolved to at plan time
#     output-dir  directory receiving d8 and its runtime data files
#
# The script materializes the submodule, checks out the requested commit,
# fetches build dependencies with gclient (depot_tools), and cross-compiles
# an arm64 d8 with V8's bundled toolchain. This is the toolchain-supported
# way to produce arm64 binaries: the bundled clang only exists for x64
# hosts, so the build runs on an x64 runner and the bench jobs execute the
# resulting binary natively on arm64 runners.

set -euo pipefail

SOURCE=$1
REF=$2
SHA=$3
OUT_DIR=$4

UPSTREAM_URL="https://chromium.googlesource.com/v8/v8.git"
DEPOT_TOOLS_URL="https://chromium.googlesource.com/chromium/tools/depot_tools.git"

if [ "$(uname -m)" != "x86_64" ]; then
  echo "this build must run on an x64 host (V8 ships no toolchain for $(uname -m) hosts)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORK_URL="$(git config -f .gitmodules submodule.v8.url)"

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

# Debian sysroots for the host tools (mksnapshot runs on x64 during the
# build) and for the arm64 target link.
python3 build/linux/sysroot_scripts/install-sysroot.py --arch=amd64
python3 build/linux/sysroot_scripts/install-sysroot.py --arch=arm64

GN_ARGS='is_debug=false dcheck_always_on=false is_component_build=false symbol_level=0 target_cpu="arm64"'
buildtools/linux64/gn gen out/release --args="$GN_ARGS"
third_party/ninja/ninja -C out/release d8

mkdir -p "$OUT_DIR"
cp out/release/d8 "$OUT_DIR/"
for data_file in snapshot_blob.bin icudtl.dat; do
  if [ -f "out/release/$data_file" ]; then
    cp "out/release/$data_file" "$OUT_DIR/"
  fi
done

file "$OUT_DIR/d8"
