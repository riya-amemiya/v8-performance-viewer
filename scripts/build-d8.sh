#!/usr/bin/env bash
# Build a release d8 for one resolved V8 version inside the v8 submodule.
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
# fetches build dependencies with gclient (depot_tools), and builds the
# release d8 used for benchmarking with tools/dev/gm.py, natively for the
# host architecture.

set -euo pipefail

SOURCE=$1
REF=$2
SHA=$3
OUT_DIR=$4

UPSTREAM_URL="https://chromium.googlesource.com/v8/v8.git"
DEPOT_TOOLS_URL="https://chromium.googlesource.com/chromium/tools/depot_tools.git"

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

# A bare clone of depot_tools ships only wrapper scripts; the gn/autoninja
# wrappers refuse to run until the pinned python3 is bootstrapped
# (python3_bin_reldir.txt). Auxiliary tools in the bootstrap (e.g.
# luci-auth) are allowed to fail, so verify the one file that matters.
"$ROOT/.depot_tools/ensure_bootstrap" || true
test -f "$ROOT/.depot_tools/python3_bin_reldir.txt"

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
case "$(uname -m)" in
  aarch64 | arm64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *)
    echo "unsupported host architecture $(uname -m)" >&2
    exit 1
    ;;
esac

# gm.py writes args.gn for the arch/mode (release: is_debug=false,
# dcheck_always_on=false, is_component_build=false), runs gn gen, and builds
# with autoninja. On arm64 hosts it selects the system clang because no
# prebuilt toolchain exists for linux-arm64.
python3 tools/dev/gm.py "$ARCH.release" d8

OUT="out/$ARCH.release"
mkdir -p "$OUT_DIR"
cp "$OUT/d8" "$OUT_DIR/"
for data_file in snapshot_blob.bin icudtl.dat; do
  if [ -f "$OUT/$data_file" ]; then
    cp "$OUT/$data_file" "$OUT_DIR/"
  fi
done

"$OUT_DIR/d8" -e 'print(version())' | tee "$OUT_DIR/version.txt"
