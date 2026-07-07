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

# On arm64 hosts gm.py uses the system clang (no prebuilt toolchain exists
# for linux-arm64), but it hardcodes clang_base_path = "/usr", which on the
# runner image resolves to a preinstalled clang without the compiler-rt
# builtins archive for aarch64. Pick a clang installation that actually
# ships it and pre-write args.gn; gm.py keeps an existing args.gn as-is.
if [ "$ARCH" = "arm64" ] && [ ! -f "out/$ARCH.release/args.gn" ]; then
  CLANG_PREFIX=""
  for prefix in $(ls -d /usr/lib/llvm-* 2>/dev/null | sort -rV) /usr; do
    clang_bin="$prefix/bin/clang"
    if [ ! -x "$clang_bin" ]; then
      continue
    fi
    runtime_dir="$("$clang_bin" --print-runtime-dir 2>/dev/null || true)"
    if [ -n "$runtime_dir" ] && { [ -f "$runtime_dir/libclang_rt.builtins.a" ] || [ -f "$runtime_dir/libclang_rt.builtins-aarch64.a" ]; }; then
      CLANG_PREFIX="$prefix"
      break
    fi
  done
  if [ -z "$CLANG_PREFIX" ]; then
    echo "no clang installation with the compiler-rt builtins archive found" >&2
    exit 1
  fi
  echo "using clang from $CLANG_PREFIX"
  mkdir -p "out/$ARCH.release"
  cat > "out/$ARCH.release/args.gn" <<EOF
is_component_build = false
is_debug = false
target_cpu = "arm64"
v8_target_cpu = "arm64"
clang_base_path = "$CLANG_PREFIX"
clang_use_chrome_plugins = false
v8_enable_sandbox = true
v8_enable_backtrace = true
v8_enable_disassembler = true
v8_enable_object_print = true
v8_enable_verify_heap = true
dcheck_always_on = false
EOF
fi

# gm.py writes args.gn for the arch/mode when missing (release:
# is_debug=false, dcheck_always_on=false, is_component_build=false), runs
# gn gen, and builds with autoninja.
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
