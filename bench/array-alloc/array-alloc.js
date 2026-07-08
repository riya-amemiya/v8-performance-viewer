// Benchmark for the tagged hole-fill V8 runs when it allocates or grows an
// array backing store. `new Array(N)` allocates an N-slot FixedArray and fills
// it with holes, and assigning past the end of an empty array grows the
// backing store and hole-fills the gap. Both go through base::Memset via
// MemsetTagged (see src/objects/fixed-array-inl.h and src/objects/elements.cc,
// the kCopyToEndAndInitializeToHole path). This is the path commit e180dd6
// ("[base] Use std::fill_n in base::Memset") rewrites, so a bench dominated by
// large hole-fills is where that change should show up.
//
// See scripts/harness.js for the run()/setup() contract. Elements are written
// and read back so the backing stores must materialize and are not eliminated.

var N = 100000;

function run() {
  var total = 0;
  for (var k = 0; k < 8; k++) {
    // Allocation hole-fill: the N-slot backing store is filled with holes.
    var a = new Array(N);
    a[k] = k;
    total += a[k];
    // Grow hole-fill: assigning at N-1 grows an empty array from zero capacity
    // and hole-fills the gap below the written index.
    var b = [];
    b[N - 1] = k;
    total += b.length;
  }
  return total;
}
