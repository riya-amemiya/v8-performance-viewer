const makeElement = (i, j) => i * M + j + 0.5;
const holey = true;
const N = 1000;
const M = 100;
const makeSub = (i) => {
  const s = [];
  for (const j of Array(M).keys()) s.push(makeElement(i, j));
  if (holey) delete s[1];
  return s;
};
const nested = [];
for (const i of Array(N).keys()) nested.push(makeSub(i));

function run() {
  return nested.flat(2).length;
}
