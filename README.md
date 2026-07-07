# v8-performance-viewer

Benchmark two V8 versions against each other and visualize the speed difference on the web.

The V8 source lives in this repository as the `v8/` git submodule (a fork of upstream V8).
For every benchmark folder, GitHub Actions builds `d8` at the two requested versions, runs the
benchmark with both builds on the same runner, and publishes an [Astro](https://astro.build)
viewer of the comparison to GitHub Pages.

## Repository layout

```
v8/                     V8 source (git submodule)
bench/<name>/           one benchmark per folder
  config.json           which versions to compare and which script to run
  <bench script>.js     the benchmark itself
scripts/
  plan.mjs              resolves configs into a build & run plan
  build-d8.sh           builds d8 for one resolved version, natively for the
                        host arch (depot_tools + gclient + tools/dev/gm.py)
  harness.js            measurement harness executed inside d8
  measure.mjs           runs the benches referencing one version with its d8 build
  merge-results.mjs     pairs per-version measurements into comparison JSON
web/                    Astro + Tailwind CSS viewer (bun)
.github/workflows/bench.yml
```

## Adding a benchmark

Create a folder under `bench/` containing a `config.json` and the benchmark script:

```json
{
  "baseline": "14.5",
  "target": "15.1",
  "bench": "./array-flat.js"
}
```

`baseline` and `target` accept the following version specs.

| Spec | Meaning |
| --- | --- |
| `15.1` | V8 milestone. Resolved to the upstream release branch tip `branch-heads/15.1`. |
| `15.1.208` | Exact or partial upstream tag. The newest matching tag wins (`-pgo` helper tags are ignored). |
| `main` | Any branch existing on the fork (the submodule remote), e.g. `main` or an experiment branch. |
| 40-hex sha | An exact commit on the fork. |

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
var BENCH_CONFIG = { samples: 30, warmupSamples: 10, minSampleMs: 50 };
```

The harness calibrates an inner iteration count so one sample takes at least `minSampleMs`,
discards `warmupSamples` warmup samples, then measures `samples` samples and reports the
median ops/sec of each build. The viewer shows the ratio of the two medians.

## CI workflow

`.github/workflows/bench.yml` runs on `workflow_dispatch` (with an optional bench-name
filter) and on pushes to `main` touching `bench/`, `scripts/`, or `web/`.

1. `plan` resolves every config into concrete commits (`node scripts/plan.mjs`).
2. `build` compiles `d8` once per unique version, in parallel, inside the `v8` submodule
   using depot_tools/gclient. Built binaries are cached by commit sha
   (`actions/cache`), so a version is only ever compiled once — expect the first build of
   a new version to take a few hours, and later runs to restore from cache in seconds.
3. `bench` runs as one job per version; each job measures only the benches referencing
   its version with its own `d8` build, so the two sides of a comparison never share a
   runner process or an execution order (warm-up state from one side cannot leak into
   the other). Each measurement records the runner CPU model for cross-checking.
4. `merge` pairs the per-version measurements into one comparison JSON per bench.
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
