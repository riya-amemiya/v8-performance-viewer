const N = 100000;
const make = (i) => i;
const a = [];
for (const i of Array(N).keys()) a.push(make(i));

function run() {
  return a.copyWithin(0, N / 2).length;
}
