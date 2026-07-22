// Benchmark for the tagged hole-fill V8 runs when it allocates an array
// backing store. `new Array(N)` allocates an N-slot FixedArray and fills it
// with holes through base::Memset via MemsetTagged (see
// src/objects/fixed-array-inl.h). That fill is the path commit e180dd6
// ("[base] Use std::fill_n in base::Memset") rewrites, so a workload dominated
// by it is where the change should show.
//
// N is kept under kMaxRegularHeapObjectSize (128 KB on x64 — kPageSizeBits is
// 18, so the limit is 1 << 17). 16000 slots is under it whether tagged slots
// are 4 bytes (pointer compression, ~64 KB) or 8 bytes (~128 KB), so each
// backing store is a regular young-generation object that dies in the next
// cheap, uniform scavenge. Above the limit the array lands in large-object
// space and is reclaimed by major GC, and the numbers then measure GC
// scheduling instead of the hole-fill — that is what made the earlier
// 100000-slot version noisy. Keeping the allocation young is what makes this a
// stable memset benchmark rather than a GC one.
//
// See scripts/harness.js for the run()/setup() contract. Each array is written,
// read back, and made to escape so the allocation and its hole-fill are real
// and not optimized away.

var N = 16000; // FixedArray backing store stays under the young-generation limit
var COUNT = 16; // allocations per measured call
var escape; // sink that forces each allocation to escape

function run() {
  var total = 0;
  for (var k = 0; k < COUNT; k++) {
    var a = new Array(N); // hole-fill N slots via MemsetTagged, young-space alloc
    a[k] = k;
    escape = a;
    total += a[k];
  }
  return total;
}
