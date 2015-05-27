// Lock down the global environment after the instrumentation has made its
// changes.
Narcissus.interpreter.resetEnvironment();
Narcissus.interpreter.populateEnvironment();
