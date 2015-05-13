function f(x) {
  var y = true
  var z = true
  if (x)
    y = false
  if (y)
    z = false
  return z
}

print(f(cloak(true)), f(cloak(false)))
