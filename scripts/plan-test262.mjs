#!/usr/bin/env node

import { resolveVersion, writePlan } from './plan.mjs';

const spec = (process.env.VERSION_SPEC ?? '').trim();
if (!spec) {
  throw new Error('VERSION_SPEC must name the V8 version spec to test');
}

writePlan({ versions: [resolveVersion(spec)] });
