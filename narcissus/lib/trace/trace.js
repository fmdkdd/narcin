(function(){
  let Narcissus = this.Narcissus;
  let interpreter = Narcissus.interpreter;
  let definitions = Narcissus.definitions;

  // Import constants in scope
  eval(definitions.consts);

  // Exposed bindings from the interpreter
  let ___ = interpreter.___;

  let nodetypesToNames = Object.keys(definitions.tokenIds);


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Utils

  let indentation = 0;
  let indentationStep = 2;

  function printIndentation(indent) {
    while (indent-- > 0) putstr(' ');
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Extensions

  function printStdout(...args) {
    printIndentation(indentation);
    putstr('#output ');
    print(...args);
  }

  function execute(proceed, n, x) {
    printIndentation(indentation);
    print(nodetypesToNames[n.type]);

    indentation += indentationStep;
    let ret = proceed(n, x);
    indentation -= indentationStep;

    return ret;
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Instrument the interpreter by overriding the following bindings with our
  // own versions.

  i13n.pushLayer(___, {
    execute: i13n.around(___.execute, execute),
    globalBase: i13n.delegate(___.globalBase, {print}),
  });

}());
