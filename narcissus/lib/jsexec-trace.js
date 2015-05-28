(function(){
  let Narcissus = this.Narcissus;
  let interpreter = Narcissus.interpreter;
  let definitions = Narcissus.definitions;

  // Import constants in scope
  eval(definitions.consts);

  // Exposed bindings from the interpreter
  let _ = interpreter._;

  let nodetypesToNames = Object.keys(definitions.tokenIds);


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Utils

  function printIndentation(indent) {
    while (indent-- > 0) putstr(' ');
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Additions to the global object.

  let globalBase = Object.create(_.globalBase);

  globalBase.print = function() {
    printIndentation(indentation);
    putstr('#output ');
    print.apply(this, arguments);
  };


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Overriding of execute.

  let indentation = 0;
  let indentationStep = 2;

  // FIXME: traces the base layer correctly, but facets call the original
  // execute, not the instrumented version.
  function execute(n, x) {
    printIndentation(indentation);
    print(nodetypesToNames[n.type]);

    indentation += indentationStep;
    let ret = _.execute(n, x);
    indentation -= indentationStep;

    return ret;
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Instrument the interpreter by overriding the following bindings with our
  // own versions.

  let instrument = interpreter.___;

  instrument.execute = execute;
  instrument.globalBase = globalBase;

  // Change prompt

  instrument.repl_prompt = "njs-trace> ";
}());
