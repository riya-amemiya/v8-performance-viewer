const p = new Proxy([], {});

function run() {
  return Array.isArray(p);
}
