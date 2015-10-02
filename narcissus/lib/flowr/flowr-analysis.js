(function(){
  let Narcissus = this.Narcissus;
  let interpreter = Narcissus.interpreter;
  let definitions = Narcissus.definitions;

  // Import constants in scope
  eval(definitions.consts);

  // Exposed bindings from the interpreter
  let ___ = interpreter.___;


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // FlowR logic

  // Store all the labels in a map, to avoid storing them on the objects
  // themselves (which could mess up with the interpreter, or client code).
  let labels = {
    send: new Map(),
    receive: new Map()
  };

  let defaultTag = new Map([['default', 1]]);

  function newLabel(send) {
    if (send === 'send')
      return new Map();
    else
      // Add default+ to receive labels
      return new Map([['default', 1]]);
  }

  function setTag(object, send, id, privilege) {
    getLabel(object, send).set(id, privilege);
  }

  function getLabel(object, send) {
    let ls = send === 'send' ? labels.send : labels.receive;

    if (!ls.has(object))
      ls.set(object, newLabel(send));

    return ls.get(object);
  }

  function allow(a, b) {
    let Sa = getLabel(a, 'send');
    let Rb = getLabel(b, 'receive');

    // print('allow', a, printLabel(Sa), b, printLabel(Rb))

    for (let id of Sa.keys())
      if (Rb.get(id) !== 1)
        return false;

    return true;
  }

  function propagate(a, b) {
    let Sa = getLabel(a, 'send');
    let Sb = getLabel(b, 'send');

    for (let [id, p] of Sa.entries()) {
      if (p === 1 && Sb.get(id) == null)
        Sb.set(id, 1);
      else if (p === 0 && Sb.has(id))
        Sb.delete(id);
    }
  }

  function check(a, b) {
    if (!allow(a, b))
      throw 'Illegal flow: ' + a + ' to ' + b;
  }

  function printLabel(l) {
    if (l == null) return '{}';

    let s = [];
    for (let [id, priv] of l.entries()) {
      s.push(id + (priv === 1 ? '+' : '-'));
    }

    return `{${s.join(',')}}`;
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // FlowR main algorithm

  // Need to capture function call.  This is done in FunctionObject.prototype.
  // We could just change __call__ in the base interpreter, but it is cleaner to
  // add a new FunctionObject in the instrumentation scope, since it can be
  // toggled off easily by deleting this property.

  var FO = ___.FunctionObject;
  function FunctionObject(...args) {
    return FO.apply(this, args);
  }
  FunctionObject.prototype = Object.create(FO.prototype);

  // On function call, execute FlowR algorithm.
  FunctionObject.prototype.__call__ = function(t, a, x) {
    let caller = x;
    let receiver = t || ___.global;
    let method = this;
    let args = a;

    check(caller, method);
    for (var i=0; i < args.length; ++i)
      check(args[i], method);
    propagate(caller, receiver);
    for (i=0; i < args.length; ++i)
      propagate(args[i], receiver);
    let ret = FO.prototype.__call__.apply(this, arguments);
    propagate(method, ret);
    check(ret, caller);
    propagate(ret, caller);

    return ret;
  };

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Instrumentation of Narcissus.interpreter

  i13n.pushLayer(___, {
    FunctionObject,
    globalBase: i13n.delegate(___.globalBase, {setTag})
  })

}());
