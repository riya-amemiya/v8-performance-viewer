# v8-performance-viewer

Benchmark V8 versions against each other and visualize the speed difference on the web.

The V8 source lives in this repository as the `v8/` git submodule (a fork of upstream V8).
For every benchmark folder, GitHub Actions builds `d8` at each requested version, runs the
benchmark on every build, and publishes an [Astro](https://astro.build) viewer of the
comparison to GitHub Pages. A bench names two or more versions; the viewer draws one bar per
version and measures each against the first (the reference).

## Repository layout

```
v8/                     V8 source (git submodule)
bench/<name>/           one benchmark per folder
  config.json           which versions to compare and which script to run
  <bench script>.js     the benchmark itself
scripts/
  plan.mjs              resolves configs into a build & run plan
  build-d8.sh           builds d8 for one resolved version (depot_tools + gclient)
  harness.js            measurement harness executed inside d8
  measure.mjs           runs the benches referencing one version with its d8 build
  merge-results.mjs     combines per-version measurements into comparison JSON
web/                    Astro + Tailwind CSS viewer (bun)
.github/workflows/bench.yml
```

## Adding a benchmark

Create a folder under `bench/` containing a `config.json` and the benchmark script:

```json
{
  "versions": ["14.5", "14.7", "15.1"],
  "bench": "./array-flat.js"
}
```

`versions` is an ordered list of two or more version specs. The first entry is the reference
the others are compared against; the viewer draws one bar per version and labels each with its
percent versus the reference. Each entry accepts the following version specs.

| Spec | Meaning |
| --- | --- |
| `15.1` | V8 milestone. Resolved to the upstream release branch tip `branch-heads/15.1`. |
| `15.1.208` | Exact or partial upstream tag. The newest matching tag wins (`-pgo` helper tags are ignored). |
| `main` | Any branch existing on the fork (the submodule remote), e.g. `main` or an experiment branch. |
| 40-hex sha | An exact commit on the fork. |

Every bench runs under `--predictable-gc-schedule` (a fixed young-generation size and
heap-growth, no memory reducer, so GC pauses stay deterministic across samples) and
`--no-allocation-site-pretenuring` (allocations stay in the young generation instead of
flipping between young and old space on allocation-site feedback, which made
allocation-heavy medians bimodal across runs); `performance.now` still reports real
wall-clock time, so the measurement is not distorted. A bench that allocates little per
iteration is unaffected. An optional `"d8Flags"` array in the config passes additional
flags to `d8` before the harness script.

The benchmark script is plain JavaScript executed by `d8`:

```js
function setup() {
  // optional, runs once before timing
}

function run() {
  // required; return a value derived from the work so V8 cannot
  // dead-code eliminate it
}

// optional overrides
var BENCH_CONFIG = { samples: 30, warmupSamples: 10, minSampleMs: 300 };
```

The harness calibrates an inner iteration count so one sample takes at least `minSampleMs`
(300ms by default), discards `warmupSamples` warmup samples, then measures `samples` samples
and reports the median ops/sec of each build. The viewer shows each version's median relative
to the reference. Longer samples average more inner iterations together, so raising
`minSampleMs` is the lever if a bench reads noisily for timing-resolution reasons; GC-pause
noise is already handled by the default d8 flags above.

## CI workflow

`.github/workflows/bench.yml` runs on `workflow_dispatch` (with an optional bench-name
filter) and on pushes to `main` touching `bench/`, `scripts/`, or `web/`.

1. `plan` resolves every config into concrete commits (`node scripts/plan.mjs`).
2. `build` compiles `d8` once per unique version, in parallel, inside the `v8` submodule
   using depot_tools/gclient. Built binaries are cached by commit sha
   (`actions/cache`), so a version is only ever compiled once — expect the first build of
   a new version to take a few hours, and later runs to restore from cache in seconds.
3. `bench` runs one job per (bench, version) pair, so each bench is measured alone on a
   fresh runner with its own `d8` build. No two versions of a comparison share a runner
   or an execution order, and a bench never shares a runner with another bench — otherwise
   its numbers would depend on which benches happen to share a version's runner and bias
   the cross-version comparison. Each measurement records the runner CPU model for
   cross-checking.
4. `merge` combines the per-run measurements into one comparison JSON per bench, with
   every version's median expressed relative to the first (the reference).
5. `deploy` injects the fresh result JSONs into the viewer, builds it with bun, and
   deploys to GitHub Pages.

GitHub Pages must be set to the "GitHub Actions" source (Settings → Pages). The deploy
job attempts to enable this automatically; if the token lacks permission, enable it once
by hand. Pages requires a public repository unless the plan supports private Pages.

## Viewer development

```sh
cd web
bun install
bun run dev
```

The committed files under `web/src/data/results/` are shim-generated sample data (the
viewer shows a banner for them); CI replaces them with measured results before building.
`SITE_URL` and `BASE_PATH` override the GitHub Pages site and base path at build time.

Scripts can be exercised without building V8: `node scripts/plan.mjs --pretty` prints the
resolved plan, and any JS engine exposing `print`/`load`/`performance.now` can execute
`scripts/harness.js` for a quick smoke test.
