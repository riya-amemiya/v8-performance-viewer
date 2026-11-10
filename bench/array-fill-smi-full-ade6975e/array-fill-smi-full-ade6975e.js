const N = 100000;
const a = [];
for (const i of Array(N).keys()) a.push(0);

function run() {
  return a.fill(42).length;
}
