loadRelativeToScript('../narcissus/jsdefs.js');
loadRelativeToScript('../narcissus/jslex.js');
loadRelativeToScript('../narcissus/jsparse.js');
loadRelativeToScript('../narcissus/jsresolve.js');
loadRelativeToScript('../facetedValues.js');
loadRelativeToScript('../narcissus/jsexec-base.js');
loadRelativeToScript('../narcissus/jsexec-flowr.js');

// Lock down the global environment after the instrumentation has made its
// changes.
Narcissus.interpreter.resetEnvironment();
Narcissus.interpreter.populateEnvironment();
