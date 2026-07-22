#!/usr/bin/env node
// Resolve bench configs under bench/ into a concrete build & run plan.
//
// Usage:
//   node scripts/plan.mjs [--pretty]
//
// Environment:
//   BENCH_FILTER   optional substring; only bench folders whose name contains
//                  it are included.
//   GITHUB_OUTPUT  when set, the plan is appended as `plan=<compact json>` so
//                  a workflow job can expose it as an output. Otherwise the
//                  plan is printed to stdout.
//
// Version spec forms accepted in each entry of a config's "versions" array:
//   "15.1"        V8 milestone; resolved to the upstream release branch tip
//                 refs/branch-heads/15.1 (the checkout V8 documents for
//                 working with a release).
//   "15.1.208"    exact or partial upstream tag; the newest matching tag
//                 wins (PGO helper tags are ignored).
//   "main"        any branch name existing on the fork remote (the submodule
//                 origin), e.g. "main" or "claude/optimize-v8-array-flat".
//   <40-hex sha>  an exact commit, fetched from the fork remote.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UPSTREAM_URL = 'https://chromium.googlesource.com/v8/v8.git';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', cwd: repoRoot });
}

const forkUrl = git('config', '-f', join(repoRoot, '.gitmodules'), 'submodule.v8.url').trim();

function lsRemote(url, ...patterns) {
  const out = execFileSync('git', ['ls-remote', url, ...patterns], {
    encoding: 'utf8',
    cwd: repoRoot,
    timeout: 120_000,
  });
  const refs = new Map();
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const [sha, ref] = line.split('\t');
    refs.set(ref, sha);
  }
  // Prefer peeled tag entries ("<ref>^{}") over annotated tag object ids.
  const resolved = new Map();
  for (const [ref, sha] of refs) {
    if (ref.endsWith('^{}')) continue;
    resolved.set(ref, refs.get(`${ref}^{}`) ?? sha);
  }
  return resolved;
}

function compareVersionTags(a, b) {
  const as = a.split('.').map(Number);
  const bs = b.split('.').map(Number);
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const diff = (as[i] ?? -1) - (bs[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

function sanitizeKey(spec) {
  return spec.replace(/[^A-Za-z0-9._-]+/g, '-');
}

function resolveSpec(spec) {
  if (/^[0-9a-f]{40}$/i.test(spec)) {
    return { spec, kind: 'sha', source: 'origin', ref: spec, sha: spec.toLowerCase(), resolved: spec };
  }

  if (/^\d+\.\d+$/.test(spec)) {
    // Milestone such as "15.1": use the upstream release branch tip. Upstream
    // carries two tag families per milestone (classic 15.1.208 style and
    // 8-digit build-id style), so tags alone are ambiguous here.
    const branchRef = `refs/branch-heads/${spec}`;
    const heads = lsRemote(UPSTREAM_URL, branchRef);
    if (!heads.has(branchRef)) {
      throw new Error(`upstream has no release branch for milestone "${spec}"`);
    }
    return {
      spec,
      kind: 'milestone',
      source: 'upstream',
      ref: branchRef,
      sha: heads.get(branchRef),
      resolved: `branch-heads/${spec}`,
    };
  }

  if (/^\d+(\.\d+){2,3}$/.test(spec)) {
    const tags = lsRemote(UPSTREAM_URL, `refs/tags/${spec}`, `refs/tags/${spec}.*`);
    const candidates = [];
    for (const [ref, sha] of tags) {
      const tag = ref.replace('refs/tags/', '');
      // Skip -pgo and any other non purely numeric helper tags.
      if (!/^\d+(\.\d+)*$/.test(tag)) continue;
      candidates.push({ tag, ref, sha });
    }
    if (candidates.length === 0) {
      throw new Error(`no upstream release tag matches version spec "${spec}"`);
    }
    candidates.sort((a, b) => compareVersionTags(a.tag, b.tag));
    const best = candidates[candidates.length - 1];
    return { spec, kind: 'tag', source: 'upstream', ref: best.ref, sha: best.sha, resolved: best.tag };
  }

  const forkBranches = lsRemote(forkUrl, `refs/heads/${spec}`);
  const forkRef = `refs/heads/${spec}`;
  if (forkBranches.has(forkRef)) {
    return { spec, kind: 'branch', source: 'origin', ref: forkRef, sha: forkBranches.get(forkRef), resolved: spec };
  }

  // Fall back to upstream branches, including release branch-heads.
  const upstream = lsRemote(UPSTREAM_URL, `refs/heads/${spec}`, `refs/branch-heads/${spec}`);
  for (const ref of [`refs/heads/${spec}`, `refs/branch-heads/${spec}`]) {
    if (upstream.has(ref)) {
      return { spec, kind: 'branch', source: 'upstream', ref, sha: upstream.get(ref), resolved: spec };
    }
  }

  throw new Error(`version spec "${spec}" is neither an upstream version tag, a fork branch, nor an upstream branch`);
}

function loadBenches(filter) {
  const benchRoot = join(repoRoot, 'bench');
  const benches = [];
  for (const entry of readdirSync(benchRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (filter && !entry.name.includes(filter)) continue;
    const dir = join(benchRoot, entry.name);
    const configPath = join(dir, 'config.json');
    if (!existsSync(configPath)) {
      throw new Error(`bench folder "${entry.name}" has no config.json`);
    }
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (typeof config.bench !== 'string' || config.bench.length === 0) {
      throw new Error(`bench "${entry.name}": config.json must define a non-empty string "bench"`);
    }
    // An ordered "versions" array of two or more specs; the first entry is the
    // reference the others are compared against.
    const versions = config.versions;
    if (!Array.isArray(versions) || versions.length < 2 || versions.some((v) => typeof v !== 'string' || v.length === 0)) {
      throw new Error(`bench "${entry.name}": config.json must define a "versions" array of at least two non-empty version specs`);
    }
    if (new Set(versions).size !== versions.length) {
      throw new Error(`bench "${entry.name}": "versions" must not repeat a spec`);
    }
    const benchFile = resolve(dir, config.bench);
    if (!existsSync(benchFile)) {
      throw new Error(`bench "${entry.name}": bench file "${config.bench}" does not exist`);
    }
    // Optional d8 flags passed before the harness script, e.g.
    // ["--predictable-gc-schedule"] to stabilize allocation-heavy benches.
    const d8Flags = config.d8Flags ?? [];
    if (!Array.isArray(d8Flags) || d8Flags.some((f) => typeof f !== 'string' || !f.startsWith('-'))) {
      throw new Error(`bench "${entry.name}": "d8Flags" must be an array of flag strings (each starting with "-")`);
    }
    benches.push({
      name: entry.name,
      dir: `bench/${entry.name}`,
      bench: config.bench,
      versions,
      d8Flags,
    });
  }
  return benches;
}

const pretty = process.argv.includes('--pretty');
const filter = (process.env.BENCH_FILTER ?? '').trim();

const benches = loadBenches(filter);
if (benches.length === 0) {
  throw new Error(filter ? `no bench folder matches filter "${filter}"` : 'no bench folders found under bench/');
}

const specs = [...new Set(benches.flatMap((b) => b.versions))];
const versions = specs.map((spec) => {
  const v = resolveSpec(spec);
  return { ...v, key: `${sanitizeKey(spec)}-${v.sha.slice(0, 10)}` };
});

// One run per (bench, version) pair. CI turns each into its own job so a bench
// is measured alone on a fresh runner for every version — never sharing a
// runner with another bench, which would make its numbers depend on which
// benches happen to share that version and bias the cross-version comparison.
const versionBySpec = new Map(versions.map((v) => [v.spec, v]));
const runs = benches.flatMap((b) =>
  b.versions.map((spec) => ({ bench: b.name, versionSpec: spec, versionKey: versionBySpec.get(spec).key })),
);

const plan = { versions, benches, runs };
const compact = JSON.stringify(plan);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `plan=${compact}\n`);
  console.log(JSON.stringify(plan, null, 2));
} else {
  console.log(pretty ? JSON.stringify(plan, null, 2) : compact);
}
