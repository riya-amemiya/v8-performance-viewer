const state = { n: 0 };

function withBodyEval(a) {
  return eval("var x" + state.n++ + " = a; a");
}

function run() {
  return withBodyEval(1);
}
