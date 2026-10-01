#!/usr/bin/env python3

import argparse
import json
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--v8-root', required=True, type=Path)
    parser.add_argument('--build-dir', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()

    out_dir = args.out.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    results_path = out_dir / 'results.json'

    sys.path.insert(0, str(args.v8_root.resolve() / 'tools'))
    from testrunner.local import statusfile
    from testrunner.local import utils
    from testrunner.standard_runner import StandardTestRunner

    skipped = {}
    read_outcomes = statusfile.StatusFile.get_outcomes

    def get_outcomes(self, testname, variant=None):
        outcomes = read_outcomes(self, testname, variant)
        if statusfile.SKIP not in outcomes:
            return outcomes | {statusfile.SKIP}
        skipped[testname] = sorted(outcomes)
        return (outcomes - {statusfile.SKIP, statusfile.PASS, statusfile.FAIL_PHASE_ONLY}) | {statusfile.FAIL}

    statusfile.StatusFile.get_outcomes = get_outcomes

    exit_code = StandardTestRunner().execute([
        f'--outdir={args.build_dir.resolve()}',
        '--variants=default',
        '--exit-after-n-failures=0',
        '--progress=dots',
        f'--json-test-results={results_path}',
        'test262',
    ])
    if exit_code not in (utils.EXIT_CODE_PASS, utils.EXIT_CODE_FAILURES, utils.EXIT_CODE_NO_TESTS):
        return exit_code

    passing = {}
    for record in json.loads(results_path.read_text())['results']:
        name = record['name'].split('/', 1)[1]
        if record['result'] != statusfile.PASS or name not in skipped:
            continue
        mode = 'strict' if '--use-strict' in record['variant_flags'] else 'sloppy'
        passing.setdefault(name, set()).add(mode)

    print()
    print(f'{len(passing)} of {len(skipped)} test262 tests marked SKIP pass:')
    for name in sorted(passing):
        print(f'  test262/{name}  [{", ".join(skipped[name])}]  {", ".join(sorted(passing[name]))}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
