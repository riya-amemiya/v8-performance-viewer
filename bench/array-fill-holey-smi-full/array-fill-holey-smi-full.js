const N = 100000;
const a = new Array(N);
a[0] = 1;
a[N - 1] = 2;

function run() {
  return a.fill(9).length;
}
