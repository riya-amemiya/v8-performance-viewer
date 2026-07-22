// Benchmark for the base::Memset hole-fill V8 runs when it grows an array's
// backing store. Setting the length of a fresh (zero-capacity) array presizes
// it: SetLengthImpl takes new_capacity = length and calls
// GrowCapacityAndConvertImpl, which allocates a fast holey backing store and
// hole-fills all N slots via kCopyToEndAndInitializeToHole -> MemsetTagged ->
// base::Memset (src/objects/elements.cc). That fill is the path commit e180dd6
// ("[base] Use std::fill_n in base::Memset") rewrites. Unlike a large sparse
// element store, the length presize stays a fast holey array rather than
// transitioning to dictionary elements, so it reliably exercises base::Memset.
//
// N stays under kMaxRegularHeapObjectSize (128 KB on x64; see array-alloc) so
// each backing store is a young-generation object that dies in a cheap
// scavenge, keeping this a stable measure of the hole-fill rather than GC.
//
// See scripts/harness.js for the run()/setup() contract. The array escapes so
// the presize and its hole-fill are real and not optimized away.

var N = 16000; // FixedArray backing store stays under the young-generation limit
var COUNT = 16; // presizes per measured call
var escape; // sink that forces each array to escape

function run() {
  var total = 0;
  for (var k = 0; k < COUNT; k++) {
    var a = [];
    a.length = N; // presize: allocate a fast holey backing store, hole-fill via base::Memset
    escape = a;
    total += a.length;
  }
  return total;
}
