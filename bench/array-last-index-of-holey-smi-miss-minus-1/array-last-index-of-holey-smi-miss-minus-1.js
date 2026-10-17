const N = 100000;
const a = new Array(N);
for (const i of a.keys()) a[i] = i;

function run() {
  return a.lastIndexOf(-1);
}
