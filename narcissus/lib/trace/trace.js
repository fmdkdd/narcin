(function(){
  let Narcissus = this.Narcissus;
  let interpreter = Narcissus.interpreter;
  let definitions = Narcissus.definitions;
  let decompiler = Narcissus.decompiler;

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

  function nodeInfo(n) {
    var name = nodetypesToNames[n.type]

    switch (n.type) {

    case VAR:
    case ASSIGN:
    case CALL:
    case DOT:
      return `${name} ${decompiler.pp(n).replace(/[\n\t]/g, ' ')}`

    case FUNCTION:
      return `${name} ${n.name}(${n.params})`

    case IDENTIFIER:
    case NUMBER:
    case STRING:
      return `${name} ${n.value}`

    default:
      return name
    }
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
    print(nodeInfo(n));

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
