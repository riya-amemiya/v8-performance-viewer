// Deep flat() across all six fast ElementsKind sub-array shapes.
// With the nextDepth==0 guard removed, sub-arrays are bulk-copied even when
// nextDepth>0. flat(2) on one-level nesting puts sub-arrays at nextDepth==1
// (improved path); flat(1) puts them at nextDepth==0 (bulk-copied in both
// versions) as a control.
//
// HOLEY shapes carry a single hole at index 1 (gap==1, well under kMaxGap==1024
// so no dictionary demotion). PACKED_ELEMENTS / HOLEY_ELEMENTS use string
// payloads, so the backing store holds tagged pointers (write-barrier path)
// instead of Smis or unboxed doubles. The outer array is PACKED_ELEMENTS in
// every case, so only the sub-array ElementsKind varies.
//
// Verify the shapes under d8 with `--allow-natives-syntax`, then %DebugPrint or
// %HasHoleyElements / %HasSmiElements / %HasDoubleElements / %HasObjectElements
// on any sub-array (e.g. pSmi[0], hObj[0]).

function makeSmiNested(n, m) {
  let o = [];
  for (let i = 0; i < n; i++) { let s = []; for (let j = 0; j < m; j++) s[j] = i*m+j; o[i] = s; }
  return o;
}
function makeDblNested(n, m) {
  let o = [];
  for (let i = 0; i < n; i++) { let s = []; for (let j = 0; j < m; j++) s[j] = i*m+j+0.5; o[i] = s; }
  return o;
}
function makeObjNested(n, m) {
  let o = [];
  for (let i = 0; i < n; i++) { let s = []; for (let j = 0; j < m; j++) s[j] = "x"+(i*m+j); o[i] = s; }
  return o;
}
// new Array(m) starts HOLEY; skipping index 1 keeps a single hole so the kind
// stays HOLEY_* instead of transitioning back to PACKED_*.
function makeSmiHoley(n, m) {
  let o = [];
  for (let i = 0; i < n; i++) { let s = new Array(m); for (let j = 0; j < m; j++) if (j !== 1) s[j] = i*m+j; o[i] = s; }
  return o;
}
function makeDblHoley(n, m) {
  let o = [];
  for (let i = 0; i < n; i++) { let s = new Array(m); for (let j = 0; j < m; j++) if (j !== 1) s[j] = i*m+j+0.5; o[i] = s; }
  return o;
}
function makeObjHoley(n, m) {
  let o = [];
  for (let i = 0; i < n; i++) { let s = new Array(m); for (let j = 0; j < m; j++) if (j !== 1) s[j] = "x"+(i*m+j); o[i] = s; }
  return o;
}

let sink;
function bench(label, o, depth, iters) {
  for (let i = 0; i < 5; i++) sink = o.flat(depth);
  let best = Infinity;
  for (let r = 0; r < 8; r++) {
    let t0 = performance.now();
    for (let i = 0; i < iters; i++) sink = o.flat(depth);
    let t1 = performance.now();
    const ms = (t1 - t0) / iters;
    if (ms < best) best = ms;
  }
  console.log(label.padEnd(36) + best.toFixed(4).padStart(10) + " ms/op");
}

let pSmi = makeSmiNested(1000, 1000);   // PACKED_SMI,      1M elements, 1000 sub-arrays of 1000
let hSmi = makeSmiHoley(1000, 1000);    // HOLEY_SMI
let pDbl = makeDblNested(1000, 1000);   // PACKED_DOUBLE
let hDbl = makeDblHoley(1000, 1000);    // HOLEY_DOUBLE
let pObj = makeObjNested(1000, 1000);   // PACKED_ELEMENTS
let hObj = makeObjHoley(1000, 1000);    // HOLEY_ELEMENTS

bench("PACKED_SMI      flat(2) [improved]", pSmi, 2, 80);
bench("PACKED_SMI      flat(1) [control]",  pSmi, 1, 80);
bench("HOLEY_SMI       flat(2) [improved]", hSmi, 2, 80);
bench("HOLEY_SMI       flat(1) [control]",  hSmi, 1, 80);
bench("PACKED_DOUBLE   flat(2) [improved]", pDbl, 2, 80);
bench("PACKED_DOUBLE   flat(1) [control]",  pDbl, 1, 80);
bench("HOLEY_DOUBLE    flat(2) [improved]", hDbl, 2, 80);
bench("HOLEY_DOUBLE    flat(1) [control]",  hDbl, 1, 80);
bench("PACKED_ELEMENTS flat(2) [improved]", pObj, 2, 80);
bench("PACKED_ELEMENTS flat(1) [control]",  pObj, 1, 80);
bench("HOLEY_ELEMENTS  flat(2) [improved]", hObj, 2, 80);
bench("HOLEY_ELEMENTS  flat(1) [control]",  hObj, 1, 80);
