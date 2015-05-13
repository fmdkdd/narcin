(function(){
  let Narcissus = this.Narcissus;
  let Zaphod = this.Zaphod;

  let parser = Narcissus.parser;
  let definitions = Narcissus.definitions;

  // Set constants in the local scope.
  eval(definitions.consts);

  // Faceted Value utilities
  let FacetedValue     = Zaphod.facets.FacetedValue;
  let ProgramCounter   = Zaphod.facets.ProgramCounter;
  let Label            = Zaphod.facets.Label;
  let buildVal         = Zaphod.facets.buildVal;
  let evaluateEach     = Zaphod.facets.evaluateEach;
  let evaluateEachPair = Zaphod.facets.evaluateEachPair;
  let strip            = Zaphod.facets.strip;
  let rebuild          = Zaphod.facets.rebuild;

  // Imports from Narcissus.interpreter

  let execute           = Narcissus.interpreter.execute;
  let executeNode       = Narcissus.interpreter.executeNode;
  let ExecutionContext  = Narcissus.interpreter.ExecutionContext;
  let Reference         = Narcissus.interpreter.Reference;
  let Activation        = Narcissus.interpreter.Activation;
  let isPrimitive       = Narcissus.interpreter.isPrimitive;
  let hasDirectProperty = Narcissus.interpreter.hasDirectProperty;
  let BREAK_SIGNAL      = Narcissus.interpreter.BREAK_SIGNAL;
  let CONTINUE_SIGNAL   = Narcissus.interpreter.CONTINUE_SIGNAL;
  let RETURN_SIGNAL     = Narcissus.interpreter.RETURN_SIGNAL;
  let END_SIGNAL        = Narcissus.interpreter.END_SIGNAL;
  let GLOBAL_CODE       = Narcissus.interpreter.GLOBAL_CODE;
  let EVAL_CODE         = Narcissus.interpreter.EVAL_CODE;
  let FUNCTION_CODE     = Narcissus.interpreter.FUNCTION_CODE;
  let MODULE_CODE       = Narcissus.interpreter.MODULE_CODE;
  let isSignal          = Narcissus.interpreter.isSignal;
  let global            = Narcissus.interpreter.global;
  let globalBase        = Narcissus.interpreter.globalBase;
  let isObject          = Narcissus.interpreter.isObject;
  let toObject          = Narcissus.interpreter.toObject;
  let newFunction       = Narcissus.interpreter.newFunction;
  let thunk             = Narcissus.interpreter.thunk;

  let addExecuteNode = Narcissus.interpreter.addExecuteNode;
  let getContext = Narcissus.interpreter.getContext;

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Adding the program counter to the current execution context.
  //
  // Re-use the existing program counter when one exists, or create
  // one from scratch.
  Narcissus.interpreter.addExecutionContextHook(
    (x) => {
      x.pc = getPC() || new ProgramCounter();
    });

  function getPC() {
    return getContext('pc');
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Additions to the global object.
  //
  // globalBase is used as a base to construct the global object that
  // is exposed to target scripts.  To rebuild the global object, call
  // Narcissus.interpreter.resetEnvironment.

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
    }, ExecutionContext.current);

    if (this instanceof String) {
      // Called as constructor: save the argument as the string value
      // of this String object and return this object.
      this.value = newStr;
      var strlen = evaluateEach(newStr, function(s,x) {
        // Called as function or constructor: convert argument to string type.
        return s ? s.length : 0;
      }, ExecutionContext.current);
      definitions.defineProperty(this, 'length', strlen, true,
                                 true, true);
      return this;
    }
    else return newStr;
  };

  // Load missing functions onto Array and String
  // ["concat", "every", "foreach", "isArray", "join", "map", "push", "pop",
  //  "reverse", "reduce", "shift", "slice", "sort", "splice",
  //  "toLocalString", "unshift"].forEach(function(fName) {
  //    definitions.defineProperty(globalBase.Array, fName, Array[fName],
  //                               false, false, true);
  //  });
  //["charAt", "charCodeAt", "concat", "fromCharCode", "indexOf",
  // ["concat", "indexOf", "charAt",
  //  "lastIndexOf", "localeCompare", "match", "replace", "search", "slice",
  //  "split", "substring", "toLowerCase", "toUpperCase", "trim", "valueOf"]
  //   .forEach(function(fName) {
  //    definitions.defineProperty(globalBase.String, fName, String[fName],
  //                               false, false, true);
  //  });

  var oldFCC = String.fromCharCode;
  globalBase.String.fromCharCode = function(v1,v2) {
    var x = ExecutionContext.current;
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
    if (v instanceof FacetedValue) {
      return derefFacetedValue(v, pc);
    }
    if (v instanceof Reference) {
      if (!v.base) {
        // Hook needed for Zaphod
        if (Narcissus.interpreter.getValueHook)
          return Narcissus.interpreter.getValueHook(v.propertyName);
        throw new ReferenceError(v.propertyName + " is not defined",
                                 v.node.filename, v.node.lineno);
      }
      return v.base[v.propertyName];
    }
    return v;
  }

  function putValue(v, w, vn, pc) {
    if (v instanceof FacetedValue) {
      // x is not really an execution environment, but is being used a
      // way of passing on data.
      return evaluateEachPair(v, w, function(ref, val, x) {
        return putValue(ref, val, x.vn, x.pc);
      }, {pc: pc, vn: vn});
    }
    else if (v instanceof Reference) {
      //return (v.base || global)[v.propertyName] = w;
      var base = v.base || global;
      var oldVal = base[v.propertyName];
      var newVal = base[v.propertyName] = buildVal(pc, w, oldVal);
      // The returned value should be the local version, not the stored
      // version.  Within a block, the extra labels are not needed and
      // are simply wasteful.
      return w;
    }
    throw new ReferenceError("Invalid assignment left-hand side",
                             vn.filename, vn.lineno);
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Overriding of executeNode.
  //
  // Here we override the base behavior for the execution of most AST
  // nodes.  In most cases, the change is to call the local version of
  // getValue, which takes an additional PC argument.  The other
  // recurring change is to recursively call execute on each facet of
  // a value, if it is a FacetedValue; this is done by wrapping the
  // original behavior of executeNode in an evaluateEach call.

  addExecuteNode(IF, function executeIF(n, x) {
    let cond = getValue(execute(n.condition, x), x.pc);
    evaluateEach(cond, function(v, x) {
      if (v)
        execute(n.thenPart, x);
      else if (n.elsePart)
        execute(n.elsePart, x);
    }, x);
  });

  addExecuteNode(SWITCH, function executeSWITCH(n, x) {
    let s = getValue(execute(n.discriminant, x), x.pc);
    let a = n.cases;
    var matchDefault = false;
    let i, j;
    switch_loop:
    for (i = 0, j = a.length; ; i++) {
      if (i === j) {
        if (n.defaultIndex >= 0) {
          i = n.defaultIndex - 1; // no case matched, do default
          matchDefault = true;
          continue;
        }
        break;                      // no default, exit switch_loop
      }
      let t = a[i];                       // next case (might be default!)
      let u;
      if (t.type === CASE) {
        u = getValue(execute(t.caseLabel, x), x.pc);
      } else {
        if (!matchDefault)          // not defaulting, skip for now
          continue;
        u = s;                      // force match to do default
      }
      if (u === s) {
        for (;;) {                  // this loop exits switch_loop
          if (t.statements.children.length) {
            try {
              execute(t.statements, x);
            } catch (e if e === BREAK_SIGNAL && x.target === n) {
              break switch_loop;
            }
          }
          if (++i === j)
            break switch_loop;
          t = a[i];
        }
        // NOT REACHED
      }
    }
  });

  addExecuteNode(FOR, function executeFOR(n, x) {
    n.setup && getValue(execute(n.setup, x), x.pc);

    executeNode[WHILE](n, x);
  });

  addExecuteNode(WHILE, function executeWHILE(n, x) {
    let whileCond = !n.condition || getValue(execute(n.condition, x), x.pc);
    evaluateEach(whileCond, (c,x) => {
      while (c) {
        try {
          execute(n.body, x);
        } catch (e if e === BREAK_SIGNAL && x.target === n) {
          break;
        } catch (e if e === CONTINUE_SIGNAL && x.target === n) {
          // Must run the update expression.
        }
        n.update && getValue(execute(n.update, x), x.pc);
        // FIXME: Label might become more secure over time.
        c = !n.condition || getValue(execute(n.condition, x), x.pc);
        if (c instanceof FacetedValue)
          throw new Error('Unhandled case: condition became more secure');
      }
    }, x);
  });

  addExecuteNode(FOR_IN, function executeFOR_IN(n, x) {
    let u = n.varDecl;
    if (u)
      execute(u, x);
    let r = n.iterator;
    let s = execute(n.object, x);
    let v = getValue(s, x.pc);

    // ECMA deviation to track extant browser JS implementation behavior.
    let t = ((v === null || v === undefined) && !x.ecma3OnlyMode)
          ? v
          : toObject(v, s, n.object);
    let a = [];
    for (let i in t)
      a.push(i);
    for (let i = 0, j = a.length; i < j; ++i) {
      putValue(execute(r, x), a[i], r, x.pc);
      try {
        execute(n.body, x);
      } catch (e if e === BREAK_SIGNAL && x.target === n) {
        break;
      } catch (e if e === CONTINUE_SIGNAL && x.target === n) {
        continue;
      }
    }
  });

  addExecuteNode(DO, function executeDO(n, x) {
    try {
      execute(n.body, x);
    } catch (e if e === BREAK_SIGNAL && x.target === n) {
      return; // Skip condition
    } catch (e if e === CONTINUE_SIGNAL && x.target === n) {
      // Go on
    }
    executeNode[WHILE](n, x);
  });

  addExecuteNode(TRY, function executeTRY(n, x) {
    let j;
    try {
      execute(n.tryBlock, x);
    } catch (e if !isSignal(e) && (j = n.catchClauses.length)) {
      x.result = undefined;
      for (let i = 0; ; i++) {
        if (i === j) {
          throw e;
        }
        let t = n.catchClauses[i];
        x.scope = {object: {}, parent: x.scope};
        definitions.defineProperty(x.scope.object, t.varName, e, true);
        try {
          if (t.guard && !getValue(execute(t.guard, x), x.pc))
            continue;
          execute(t.block, x);
          break;
        } finally {
          x.scope = x.scope.parent;
        }
      }
    } finally {
      if (n.finallyBlock)
        execute(n.finallyBlock, x);
    }
  });

  addExecuteNode(THROW, function executeTHROW(n, x) {
    throw getValue(execute(n.exception, x), x.pc);
  });

  addExecuteNode(RETURN, function executeRETURN(n, x) {
    // Check for returns with no return value
    x.result = n.value ? getValue(execute(n.value, x), x.pc) : undefined;
    throw RETURN_SIGNAL;
  });

  addExecuteNode(WITH, function executeWITH(n, x) {
    let r = execute(n.object, x);
    let t = getValue(r, x.pc);
    evaluateEach(t, (t,x) => {
      let o = toObject(t, r, n.object);
      x.scope = {object: o, parent: x.scope};
      try {
        execute(n.body, x);
      } finally {
        x.scope = x.scope.parent;
      }
    }, x);
  });

  addExecuteNode(
    CONST,
    VAR, function executeCONST_VAR(n, x) {
      //FIXME: Real destructuring will be done by jsdesugar.js
      function initializeVar(x, varName, varValue, type) {
        var s;
        let bv = buildVal(x.pc, varValue, undefined);
        for (s = x.scope; s; s = s.parent) {
          if (hasDirectProperty(s.object, varName))
            break;
        }
        if (type === CONST)
          definitions.defineProperty(s.object, varName, bv,
                                     x.type !== EVAL_CODE, true);
        else
          s.object[varName] = bv;
      }

      let c = n.children;
      // destructuring assignments
      if (c[0].name && c[0].name.type === ARRAY_INIT) {
        let init = c[0].initializer;
        if (init.type === ARRAY_INIT) {
          let initializers = init.children;
          for (let i = 0, j = initializers.length; i < j; i++) {
            let u = initializers[i];
            let t = c[0].name.children[i].value;
            initializeVar(x, t, getValue(execute(u,x), x.pc), n.type);
          }
        }
        else {
          let arrVal = getValue(execute(init,x), x.pc);
          for (let i = 0, j = arrVal.length; i < j; i++) {
            let t = c[0].name.children[i].value;
            initializeVar(x, t, arrVal[i], n.type);
          }
        }
      }
      else for (let i = 0, j = c.length; i < j; i++) {
        let u = c[i].initializer;
        if (!u)
          continue;
        let t = c[i].name;
        initializeVar(x, t, getValue(execute(u,x), x.pc), n.type);
      }
    });

  addExecuteNode(SEMICOLON, function executeSEMICOLON(n, x) {
    if (n.expression)
      x.result = getValue(execute(n.expression, x), x.pc);
  });

  addExecuteNode(COMMA, function executeCOMMA(n, x) {
    let c = n.children;
    let v;
    for (let i = 0, j = c.length; i < j; i++)
      v = getValue(execute(c[i], x), x.pc);
    return v;
  });

  addExecuteNode(ASSIGN, function executeASSIGN(n, x) {
    let c = n.children;
    let r = execute(c[0], x);
    let t = n.assignOp;
    let u;
    if (t)
      u = getValue(r, x.pc);
    let v = getValue(execute(c[1], x), x.pc);
    if (t) {
      v = evalBinOp(u, v, x, t);
    }
    putValue(r, v, c[0], x.pc);
    return v;
  });

  addExecuteNode(HOOK, function executeHOOK(n, x) {
    let c = n.children;
    let t = getValue(execute(c[0], x), x.pc);
    let v = evaluateEach(t, (t,x) => {
      return t ? getValue(execute(c[1], x), x.pc)
        : getValue(execute(c[2], x), x.pc);
    }, x);
    return v;
  });

  addExecuteNode(OR, function executeOR(n, x) {
    let c = n.children;
    let v = getValue(execute(c[0], x), x.pc);

    v = evaluateEach(v, (v1, x) => {
      return v1 || getValue(execute(c[1], x), x.pc);
    }, x);

    return v;
  });

  addExecuteNode(AND, function executeAND(n, x) {
    let c = n.children;
    let v = getValue(execute(c[0], x), x.pc);

    v = evaluateEach(v, (v1, x) => {
      return v1 && getValue(execute(c[1], x), x.pc);
    }, x);

    return v;
  });

  addExecuteNode(
    EQ,
    BITWISE_OR,
    BITWISE_XOR,
    BITWISE_AND,
    NE,
    STRICT_EQ,
    STRICT_EQ,
    STRICT_NE,
    LT,
    LE,
    GE,
    GT,
      IN,
    LSH,
    RSH,
    URSH,
    PLUS,
    MINUS,
    MUL,
    DIV,
    MOD,
    function executeBINARY_OP(n, x) {
      let c = n.children;
      let v1 = getValue(execute(c[0], x), x.pc);
      let v2 = getValue(execute(c[1], x), x.pc);
      return evalBinOp(v1, v2, x, n.type);
    });

  addExecuteNode(
    NOT,
    BITWISE_NOT,
    UNARY_PLUS,
    UNARY_MINUS,
    function executeUNARY_OP(n, x) {
      let c = n.children;
      let v = getValue(execute(c[0], x), x.pc);
      return evalUnaryOp(v, x, n.type);
    });

  addExecuteNode(INSTANCEOF, function executeINSTANCEOF(n, x) {
    let c = n.children;
    let t = getValue(execute(c[0], x), x.pc);
    let u = getValue(execute(c[1], x), x.pc);
    return evaluateEachPair(t, u, (t, u, pc) => {
      if (isObject(u) && typeof u.__hasInstance__ === "function")
        return u.__hasInstance__(t);
      else
        return t instanceof u;
    }, x);
  });

  addExecuteNode(DELETE, function executeDELETE(n, x) {
    let t = execute(n.children[0], x);
    return evaluateEach(t, (t,x) => {
      return !(t instanceof Reference) || delete t.base[t.propertyName];
    }, x);
  });

  addExecuteNode(VOID, function executeVOID(n, x) {
    getValue(execute(n.children[0], x), x.pc);
  });

  addExecuteNode(TYPEOF, function executeTYPEOF(n, x) {
    let t = execute(n.children[0], x);
    return evaluateEach(t, (t,x) => {
      if (t instanceof Reference)
        t = t.base ? t.base[t.propertyName] : undefined;
      return typeof t;
    }, x);
  });

  addExecuteNode(
    INCREMENT,
    DECREMENT,
    function executeINCREMENT_DECREMENT(n, x) {
      let t = execute(n.children[0], x);
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
    });

  addExecuteNode(DOT, function executeDOT(n, x) {
    let c = n.children;
    let r = execute(c[0], x);
    let t = getValue(r, x.pc);
    return evaluateEach(t, (t,x) => {
      let u = c[1].value;
      return new Reference(toObject(t, r, c[0]), u, n);
    }, x);
  });

  addExecuteNode(INDEX, function executeINDEX(n, x) {
    let c = n.children;
    let r = execute(c[0], x);
    let t = getValue(r, x.pc);
    let u = getValue(execute(c[1], x), x.pc);
    return evaluateEachPair(t, u, function(t, u) {
      return new Reference(toObject(t, r, c[0]), String(u), n);
    }, x);
  });

  addExecuteNode(LIST, function executeLIST(n, x) {
    // Curse ECMA for specifying that arguments is not an Array object!
    let v = {};
    let c = n.children;
    let i, j;
    for (i = 0, j = c.length; i < j; i++) {
      let u = getValue(execute(c[i], x), x.pc);
      definitions.defineProperty(v, i, u, false, false, true);
    }
    definitions.defineProperty(v, "length", i, false, false, true);
    return v;
  });

  addExecuteNode(CALL, function executeCALL(n, x) {
    let c = n.children;
    let r = execute(c[0], x);
    let a = execute(c[1], x);
    let f = getValue(r, x.pc);
    return evaluateEachPair(f, r, (f, r, x) => {
      x.staticEnv = n.staticEnv;
      if (isPrimitive(f) || typeof f.__call__ !== "function") {
        throw new TypeError(r + " is not callable", c[0].filename, c[0].lineno);
      }
      let t = (r instanceof Reference) ? r.base : null;
      if (t instanceof Activation)
        t = null;
      return f.__call__(t, a, x);
    }, x);
  });

  addExecuteNode(
    NEW_WITH_ARGS,
    NEW,
    function executeNEW(n, x) {
      let c = n.children;
      let r = execute(c[0], x);
      let f = getValue(r, x.pc);
      let a;
      if (n.type === NEW) {
        a = {};
        definitions.defineProperty(a, "length", 0, false, false, true);
      } else {
        a = execute(c[1], x);
      }
      return evaluateEach(f, (f,x) => {
        if (isPrimitive(f) || typeof f.__construct__ !== "function") {
          throw new TypeError(r + " is not a constructor",
                              c[0].filename, c[0].lineno);
        }
        return f.__construct__(a, x);
      }, x);
    });

  addExecuteNode(ARRAY_INIT, function executeARRAY_INIT(n, x) {
    let v = [];
    let c = n.children;
    let i, j;
    for (i = 0, j = c.length; i < j; i++) {
      if (c[i])
        v[i] = getValue(execute(c[i], x), x.pc);
    }
    v.length = j;
    return v;
  });

  addExecuteNode(OBJECT_INIT, function executeOBJECT_INIT(n, x) {
    let v = {};
    let c = n.children;
    for (let i = 0, j = c.length; i < j; i++) {
      let t = c[i];
      if (t.type === PROPERTY_INIT) {
        let c2 = t.children;
        v[c2[0].value] = getValue(execute(c2[1], x), x.pc);
      } else {
        let f = newFunction(t, x);
        let u = (t.type === GETTER) ? '__defineGetter__'
              : '__defineSetter__';
        v[u](t.name, thunk(f, x));
      }
    }
    return v;
  });

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Override native functions calling for faceted evaluation.

  Narcissus.interpreter.FpCall = function(t, a, x) {
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
  // Change prompt

  Narcissus.interpreter.repl_prompt = "njs-facets> ";

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Add exports to Narcissus.interpreter.

  Narcissus.interpreter.getPC = getPC;

}());
