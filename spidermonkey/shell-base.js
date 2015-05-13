loadRelativeToScript('../narcissus/jsdefs.js');
loadRelativeToScript('../narcissus/jslex.js');
loadRelativeToScript('../narcissus/jsparse.js');
loadRelativeToScript('../narcissus/jsresolve.js');
loadRelativeToScript('../narcissus/jsexec-base.js');

Narcissus.interpreter.resetEnvironment();
Narcissus.interpreter.populateEnvironment();
