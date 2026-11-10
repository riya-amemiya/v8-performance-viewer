const p = new Proxy({ x: 1 }, {});

function run() {
  return "x" in p;
}
