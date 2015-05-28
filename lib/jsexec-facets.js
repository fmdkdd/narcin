(function(){
  let Narcissus = this.Narcissus;
  let Zaphod = this.Zaphod;
  let interpreter = Narcissus.interpreter;
  let definitions = Narcissus.definitions;

  // Import constants in scope
  eval(definitions.consts);

  // Exposed bindings from the interpreter
  let _ = interpreter._;

  // Faceted Value utilities
  let FacetedValue     = Zaphod.facets.FacetedValue;
  let ProgramCounter   = Zaphod.facets.ProgramCounter;
  let Label            = Zaphod.facets.Label;
  let buildVal         = Zaphod.facets.buildVal;
  let evaluateEach     = Zaphod.facets.evaluateEach;
  let evaluateEachPair = Zaphod.facets.evaluateEachPair;
  let strip            = Zaphod.facets.strip;
  let rebuild          = Zaphod.facets.rebuild;

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Adding the program counter to the current execution context by subclassing
  // ExecutionContext.
  //
  // Re-use the existing program counter when one exists, or create
  // one from scratch.

  function ExecutionContext(type, version) {
    _.ExecutionContext.call(this, type, version);

    this.pc = getPC() || new ProgramCounter();
  }
  ExecutionContext.prototype = Object.create(_.ExecutionContext.prototype);

  function getPC() {
    var x = _.getCurrentExecutionContext();
    return x && x.pc;
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Additions to the global object.
  //
  // globalBase is used as a base to construct the global object that
  // is exposed to target scripts.  To rebuild the global object, call
  // Narcissus.interpreter.resetEnvironment.

  // We create a new globalBase that inherits from the original one, and will
  // replace it in its scope.
  var globalBase = Object.create(_.globalBase);

  globalBase.cloak = v => {
    // In Zaphod, sticking with a 2-element lattice
    return Zaphod.facets.cloak(v,'h');
  };

  // Displays only high alerts (assumes a simple hi/lo lattice
  globalBase.alert = msg => {
    let pc = getPC();
    if (pc.containsStr('h') || pc.isEmpty())
      alert(msg);
    else
      Zaphod.log('Suppressed unauthorized alert pc:' + pc + ' msg: "' + msg + '"');
  };

  globalBase.exportValue = fv => {
    let v = (fv instanceof FacetedValue) ? fv.unauthorized : fv;
    alert('Attacker sees "' + v + '"');
  };

  globalBase.isFacetedValue = v => {
    return (v instanceof FacetedValue);
  };

  // A view is represented as a program counter, except that all
  // labels can only be 'positive'.  If a label is not explicitly in
  // the view, the viewer sees the unauthorized view.
  globalBase.getView = Zaphod.facets.getView;

  globalBase.getAuth = v => {
    return Zaphod.facets.getView(v, new ProgramCounter(new Label('h')));
  };

  globalBase.getUnAuth = v => {
    return Zaphod.facets.getView(v, new ProgramCounter((new Label('h'))
                                                       .reverse()));
  };

  globalBase.String = function String(s) {
    var argSpecified = arguments.length;
    var newStr = evaluateEach(s, function(s,x) {
      // Called as function or constructor: convert argument to string type.
      return (argSpecified ? "" + s : "");
    }, _.getCurrentExecutionContext());

    if (this instanceof String) {
      // Called as constructor: save the argument as the string value
      // of this String object and return this object.
      this.value = newStr;
      var strlen = evaluateEach(newStr, function(s,x) {
        // Called as function or constructor: convert argument to string type.
        return s ? s.length : 0;
      }, _.getCurrentExecutionContext());
      definitions.defineProperty(this, 'length', strlen, true,
                                 true, true);
      return this;
    }
    else return newStr;
  };

  var oldFCC = String.fromCharCode;
  globalBase.String.fromCharCode = function(v1,v2) {
    var x = _.getCurrentExecutionContext();
    return evaluateEachPair(v1, v2, function(v1,v2,x) {
      if (v2) return oldFCC(v1,v2);
      else return oldFCC(v1);
    }, x);
  };

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Utils for executeNode.

  // Operators
  var ops = {};
  ops[BITWISE_OR]  = '|';
  ops[BITWISE_XOR] = '^';
  ops[BITWISE_AND] = '&';
  ops[EQ]          = '==';
  ops[NE]          = '!=';
  ops[STRICT_EQ]   = '===';
  ops[STRICT_NE]   = '!==';
  ops[LT]          = '<';
  ops[LE]          = '<=';
  ops[GE]          = '>=';
  ops[GT]          = '>';
  ops[IN]          = ' in ';
  ops[LSH]         = '<<';
  ops[RSH]         = '>>';
  ops[URSH]        = '>>>';
  ops[PLUS]        = '+';
  ops[MINUS]       = '-';
  ops[MUL]         = '*';
  ops[DIV]         = '/';
  ops[MOD]         = '%';
  ops[NOT]         = '!';
  ops[BITWISE_NOT] = '~';
  ops[UNARY_PLUS]  = '+';
  ops[UNARY_MINUS] = '-';


  function evalUnaryOp(v, x, opType) {
    return evaluateEach(v, function(v) {
      return eval(ops[opType] + "v");
    }, x);
  }

  function evalBinOp(v1, v2, x, opType) {
    return evaluateEachPair(v1, v2, function(v1, v2) {
      return eval('v1' + ops[opType] + 'v2');
    }, x);
  }

  function derefFacetedValue(v, pc) {
    var k = v.label,
        auth = v.authorized,
        unauth = v.unauthorized;
    if (pc.contains(k)) {
      return getValue(auth, pc);
    }
    else if (pc.contains(k.reverse())) {
      return getValue(unauth, pc);
    }
    else {
      return buildVal(new ProgramCounter(k),
                      getValue(auth, pc.join(k)),
                      getValue(unauth, pc.join(k.reverse())));
    }
  }

  function getValue(v, pc) {
    // PC is undefined if getValue was called from interpreter, without the
    // additional argument.
    if (pc == null)
      pc = getPC();

    if (v instanceof FacetedValue) {
      return derefFacetedValue(v, pc);
    }

    return _.getValue(v);
  }

  function putValue(v, w, vn, pc) {
    // PC is undefined if getValue was called from interpreter, without the
    // additional argument.
    if (pc == null)
      pc = getPC();

    if (v instanceof FacetedValue) {
      // x is not really an execution environment, but is being used a
      // way of passing on data.
      return evaluateEachPair(v, w, function(ref, val, x) {
        return putValue(ref, val, x.vn, x.pc);
      }, {pc: pc, vn: vn});
    }
    else if (v instanceof _.Reference) {
      //return (v.base || global)[v.propertyName] = w;
      var base = v.base || _.global;
      var oldVal = base[v.propertyName];
      var newVal = base[v.propertyName] = buildVal(pc, w, oldVal);
      // The returned value should be the local version, not the stored
      // version.  Within a block, the extra labels are not needed and
      // are simply wasteful.
      return w;
    }
    throw new ReferenceError("Invalid assignment left-hand side",
                             vn.filename, vn.lineno);
  };

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Overriding of executeNode.
  //
  // Here we override the base behavior for the execution of most AST nodes.
  // The recurring change is to recursively call execute on each facet of a
  // value, if it is a FacetedValue; this is done by wrapping the original
  // behavior of executeNode in an evaluateEach call.

  var executeNode = Object.create(_.executeNode);

  executeNode[IF] = function(n, x) {
    let cond = getValue(_.execute(n.condition, x), x.pc);
    evaluateEach(cond, function(v, x) {
      if (v)
        _.execute(n.thenPart, x);
      else if (n.elsePart)
        _.execute(n.elsePart, x);
    }, x);
  };

  executeNode[WHILE] = function(n, x) {
    let whileCond = !n.condition || getValue(_.execute(n.condition, x), x.pc);
    evaluateEach(whileCond, (c,x) => {
      while (c) {
        try {
          _.execute(n.body, x);
        } catch (e if e === _.BREAK_SIGNAL && x.target === n) {
          break;
        } catch (e if e === _.CONTINUE_SIGNAL && x.target === n) {
          // Must run the update expression.
        }
        n.update && getValue(_.execute(n.update, x), x.pc);
        // FIXME: Label might become more secure over time.
        c = !n.condition || getValue(_.execute(n.condition, x), x.pc);
        if (c instanceof FacetedValue)
          throw new Error('Unhandled case: condition became more secure');
      }
    }, x);
  };

  executeNode[ASSIGN] = function(n, x) {
    let c = n.children;
    let r = _.execute(c[0], x);
    let t = n.assignOp;
    let u;
    if (t)
      u = getValue(r, x.pc);
    let v = getValue(_.execute(c[1], x), x.pc);
    if (t) {
      v = evalBinOp(u, v, x, t);
    }
    putValue(r, v, c[0], x.pc);
    return v;
  };

  executeNode[HOOK] = function(n, x) {
    let c = n.children;
    let t = getValue(_.execute(c[0], x), x.pc);
    let v = evaluateEach(t, (t,x) => {
      return t ? getValue(_.execute(c[1], x), x.pc)
        : getValue(_.execute(c[2], x), x.pc);
    }, x);
    return v;
  };

  executeNode[OR] = function(n, x) {
    let c = n.children;
    let v = getValue(_.execute(c[0], x), x.pc);

    v = evaluateEach(v, (v1, x) => {
      return v1 || getValue(_.execute(c[1], x), x.pc);
    }, x);

    return v;
  };

  executeNode[AND] = function(n, x) {
    let c = n.children;
    let v = getValue(_.execute(c[0], x), x.pc);

    v = evaluateEach(v, (v1, x) => {
      return v1 && getValue(_.execute(c[1], x), x.pc);
    }, x);

    return v;
  };

  executeNode[EQ] =
    executeNode[BITWISE_OR] =
    executeNode[BITWISE_XOR] =
    executeNode[BITWISE_AND] =
    executeNode[NE] =
    executeNode[STRICT_EQ] =
    executeNode[STRICT_EQ] =
    executeNode[STRICT_NE] =
    executeNode[LT] =
    executeNode[LE] =
    executeNode[GE] =
    executeNode[GT] =
    executeNode[IN] =
    executeNode[LSH] =
    executeNode[RSH] =
    executeNode[URSH] =
    executeNode[PLUS] =
    executeNode[MINUS] =
    executeNode[MUL] =
    executeNode[DIV] =
    executeNode[MOD] =
    function(n, x) {
      let c = n.children;
      let v1 = getValue(_.execute(c[0], x), x.pc);
      let v2 = getValue(_.execute(c[1], x), x.pc);
      return evalBinOp(v1, v2, x, n.type);
    };

  executeNode[NOT] =
    executeNode[BITWISE_NOT] =
    executeNode[UNARY_PLUS] =
    executeNode[UNARY_MINUS] =
    function(n, x) {
      let c = n.children;
      let v = getValue(_.execute(c[0], x), x.pc);
      return evalUnaryOp(v, x, n.type);
    };

  executeNode[INSTANCEOF] = function(n, x) {
    let c = n.children;
    let t = getValue(_.execute(c[0], x), x.pc);
    let u = getValue(_.execute(c[1], x), x.pc);
    return evaluateEachPair(t, u, (t, u, pc) => {
      if (_.isObject(u) && typeof u.__hasInstance__ === "function")
        return u.__hasInstance__(t);
      else
        return t instanceof u;
    }, x);
  };

  executeNode[DELETE] = function(n, x) {
    let t = _.execute(n.children[0], x);
    return evaluateEach(t, (t,x) => {
      return !(t instanceof _.Reference) || delete t.base[t.propertyName];
    }, x);
  };

  executeNode[TYPEOF] = function(n, x) {
    let t = _.execute(n.children[0], x);
    return evaluateEach(t, (t,x) => {
      if (t instanceof _.Reference)
        t = t.base ? t.base[t.propertyName] : undefined;
      return typeof t;
    }, x);
  };

  executeNode[INCREMENT] =
    executeNode[DECREMENT] =
    function(n, x) {
      let t = _.execute(n.children[0], x);
      let u = Number(getValue(t, x.pc));
      let v;
      if (n.postfix)
        v = u;
      u = evaluateEach(u, (u,x) => {
        let newVal = Number(n.type===INCREMENT ? u+1 : u-1);
        return putValue(t, newVal, n.children[0], x.pc);
      }, x);
      if (!n.postfix)
        v = u;
      return v;
    };

  executeNode[DOT] = function(n, x) {
    let c = n.children;
    let r = _.execute(c[0], x);
    let t = getValue(r, x.pc);
    return evaluateEach(t, (t,x) => {
      let u = c[1].value;
      return new _.Reference(_.toObject(t, r, c[0]), u, n);
    }, x);
  };

  executeNode[INDEX] = function(n, x) {
    let c = n.children;
    let r = _.execute(c[0], x);
    let t = getValue(r, x.pc);
    let u = getValue(_.execute(c[1], x), x.pc);
    return evaluateEachPair(t, u, function(t, u) {
      return new _.Reference(_.toObject(t, r, c[0]), String(u), n);
    }, x);
  };

  executeNode[CALL] = function(n, x) {
    let c = n.children;
    let r = _.execute(c[0], x);
    let a = _.execute(c[1], x);
    let f = getValue(r, x.pc);
    return evaluateEachPair(f, r, (f, r, x) => {
      x.staticEnv = n.staticEnv;
      if (_.isPrimitive(f) || typeof f.__call__ !== "function") {
        throw new TypeError(r + " is not callable", c[0].filename, c[0].lineno);
      }
      let t = (r instanceof _.Reference) ? r.base : null;
      if (t instanceof _.Activation)
        t = null;
      return f.__call__(t, a, x);
    }, x);
  };

  executeNode[NEW_WITH_ARGS] =
    executeNode[NEW] =
    function(n, x) {
      let c = n.children;
      let r = _.execute(c[0], x);
      let f = getValue(r, x.pc);
      let a;
      if (n.type === NEW) {
        a = {};
        definitions.defineProperty(a, "length", 0, false, false, true);
      } else {
        a = _.execute(c[1], x);
      }
      return evaluateEach(f, (f,x) => {
        if (_.isPrimitive(f) || typeof f.__construct__ !== "function") {
          throw new TypeError(r + " is not a constructor",
                              c[0].filename, c[0].lineno);
        }
        return f.__construct__(a, x);
      }, x);
    };


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Override native functions calling for faceted evaluation.

  function FpCall(t, a, x) {
    // Curse ECMA yet again!
    //FIXME: Need support for faceted arguments here
    a = Array.prototype.slice.call(a, 0, a.length);
    if (!definitions.isNativeCode(this)) {
      return this.apply(t, a);
    }
    var thisObj = this;
    switch (a.length) {
    case 1:
      return evaluateEach(rebuild(a[0],x.pc), function(v,x) {
        return thisObj.call(t, v);
      }, x);
    case 2:
      return evaluateEachPair(strip(a[0],x.pc), strip(a[1],x.pc),
                              function(v1,v2,x) {
                                return thisObj.call(t, v1, v2);
                              }, x);
      //No support for more than 2 FV
      //arguments for native functions
    default:
      return thisObj.apply(t, a);
    }
  };


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Instrument the interpreter by overriding the following bindings with our
  // own versions.

  // Instrumentation scope
  let instrument = interpreter.___;

  instrument.ExecutionContext = ExecutionContext;
  instrument.getValue = getValue;
  instrument.putValue = putValue;
  instrument.executeNode = executeNode;
  instrument.globalBase = globalBase;
  instrument.FpCall = FpCall;


  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Change prompt

  instrument.repl_prompt = "njs-facets> ";

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Add exports to Narcissus.interpreter.

  interpreter.getPC = getPC;

}());
