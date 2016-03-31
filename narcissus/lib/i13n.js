var i13n = (function() {
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Instrumentation helpers

  // Return a function that will execute function B, then function FN, and
  // return the return value of FN.  Function B receives all the arguments
  // passed to FN.
  function before(fn, b) {
    return function(...args) {
      b(...args);
      return fn(...args);
    }
  }

  function around(fn, a) {
    return function(...args) {
      return a(fn, ...args);
    }
  }

  // Return a new object containing the properties of R, and with O as
  // prototype.
  function delegate(o, r) {
    var n = Object.create(o)
    Object.assign(n, r)
    return n
  }

  function pushLayer(o, l) {
    var p = Object.getPrototypeOf(o)
    Object.setPrototypeOf(l, p)
    Object.setPrototypeOf(o, l)
  }

  function removeLayer(o, l) {
    var p
    while ((p = Object.getPrototypeOf(o)) != null) {
      if (p === l) {
        // Found l, remove it from the chain
        Object.setPrototypeOf(o, Object.getPrototypeOf(p))
        Object.setPrototypeOf(l, null)
        return
      }

      // Continue with p as the current object
      o = p
    }

    // l was not on the chain
  }

  return {
    before,
    around,
    delegate,
    pushLayer,
    removeLayer,
  }

}())
