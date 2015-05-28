function f(n) {
  switch (n) {
  case 1: print("1"); break;
  case 2: print("2"); // FALLTHROUGH
  case 3: print("3"); break;
  default: print("default");
  }
}

f(1); f(2); f(3); f(4);
