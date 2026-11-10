const state = { n: 0 };

function withParameterEval(a, b = eval("var x" + state.n++ + " = a; a")) {
  return b;
}

function run() {
  return withParameterEval(1);
}
