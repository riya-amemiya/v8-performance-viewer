const N = 100000;
const a = [];
for (const i of Array(N).keys()) a[i] = i + 0.5;

function run() {
  return a.lastIndexOf(-1.25);
}
