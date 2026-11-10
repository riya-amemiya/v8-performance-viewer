const N = 1000;
const source = [];
for (const i of Array(N).keys()) source.push((i * 7919) % N);
const compare = (a, b) => a - b;

function run() {
  return source.toSorted(compare)[N - 1];
}
