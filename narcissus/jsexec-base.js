/* ***** BEGIN LICENSE BLOCK *****
 *
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Narcissus JavaScript engine.
 *
 * The Initial Developer of the Original Code is
 * Brendan Eich <brendan@mozilla.org>.
 * Portions created by the Initial Developer are Copyright (C) 2004
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Tom Austin <taustin@ucsc.edu>
 *   Brendan Eich <brendan@mozilla.org>
 *   Shu-Yu Guo <shu@rfrn.org>
 *   Dave Herman <dherman@mozilla.com>
 *   Dimitris Vardoulakis <dimvar@ccs.neu.edu>
 *   Patrick Walton <pcwalton@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Narcissus - JS implemented in JS.
 *
 * Execution of parse trees.
 *
 * Standard classes except for eval, Function, Array, and String are borrowed
 * from the host JS environment.  Function is metacircular.  Array and String
 * are reflected via wrapping the corresponding native constructor and adding
 * an extra level of prototype-based delegation.
 */

/*global Narcissus, print, putstr, readline, snarf, assertEq, uneval */
Narcissus.interpreter = (function() {
  var ___ = {};
  with (___) {

  var parser = Narcissus.parser;
  var definitions = Narcissus.definitions;
  var resolver = Narcissus.resolver;
  var hostGlobal = Narcissus.hostGlobal;
  var desugaring = Narcissus.desugaring;

  // Set constants in the local scope.
  eval(definitions.consts);

  const StringMap = definitions.StringMap;
  const ObjectMap = definitions.ObjectMap;
  const StaticEnv = resolver.StaticEnv;
  const Def = resolver.Def;

  const GLOBAL_CODE = 0, EVAL_CODE = 1, FUNCTION_CODE = 2, MODULE_CODE = 3;

  // Control flow signals
  const BREAK_SIGNAL = {},
        CONTINUE_SIGNAL = {},
        RETURN_SIGNAL = {},
        END_SIGNAL = {};

  function isSignal(s) {
    if (s === BREAK_SIGNAL) return true;
    if (s === CONTINUE_SIGNAL) return true;
    if (s === RETURN_SIGNAL) return true;
    if (s === END_SIGNAL) return true;
    return false;
  }

  function ExecutionContext(type, version) {
    this.type = type;
    this.version = version;
    // In Harmony, the global scope record is not exposed to the program.
    if (type === GLOBAL_CODE && version === "harmony") {
      this.scope = {object: globalScope, parent: null};
      this.thisObject = globalMirror;
    }

  }

  function getCurrentExecutionContext(name) {
    return ExecutionContext.current;
  }

  function isStackOverflow(e) {
    var re = /InternalError: (script stack space quota is exhausted|too much recursion)/;
    return re.test(e.toString());
  }

  // The underlying global object for narcissus.
  var globalBase = {
    // Value properties.
    NaN: NaN, Infinity: Infinity, undefined: undefined,

    // Function properties.
    eval: function eval(s) {
      if (typeof s !== "string")
        return s;

      var x = ExecutionContext.current;
      var x2 = new ExecutionContext(EVAL_CODE, x.version);
      x2.thisObject = x.thisObject;
      x2.thisModule = x.thisModule;
      x2.caller = x.caller;
      x2.callee = x.callee;
      x2.scope = x.version === "harmony" ?
        { object: new Object, parent: x.scope } : x.scope;

      var ast = parser.parse(s);
      if (x.version === "harmony") {
        resolver.resolve(ast, new StaticEnv(x.staticEnv));
        instantiateModules(ast, x2.scope);
      }
      x2.execute(ast);
      return x2.result;
    },

    // Class constructors.  Where ECMA-262 requires C.length === 1, we declare
    // a dummy formal parameter.
    Function: function Function(dummy) {
      var p = "", b = "", n = arguments.length;
      if (n) {
        var m = n - 1;
        if (m) {
          p += arguments[0];
          for (var k = 1; k < m; k++)
            p += "," + arguments[k];
        }
        b += arguments[m];
      }

      // XXX We want to pass a good file and line to the tokenizer.
      // Note the anonymous name to maintain parity with Spidermonkey.
      var t = new parser.Tokenizer("anonymous(" + p + ") {" + b + "}");

      // NB: Use the STATEMENT_FORM constant since we don't want to push this
      // function onto the fake compilation context.
      var f = parser.FunctionDefinition(t, null, false, parser.STATEMENT_FORM);
      var s = {object: global, parent: null};
      return newFunction(f,{scope:s});
    },
    Array: function (dummy) {
      // Array when called as a function acts as a constructor.
      return Array.apply(this, arguments);
    },
    String: function String(s) {
      // Called as function or constructor: convert argument to string type.
      s = arguments.length ? "" + s : "";
      if (this instanceof String) {
        // Called as constructor: save the argument as the string value
        // of this String object and return this object.
        this.value = s;

        // Also set the length of the string
        var len = s ? s.length : 0;
        definitions.defineProperty(this, 'length', len, true, true, true);

        return this;
      }
      return s;
    },

    // Don't want to proxy RegExp or some features won't work
    RegExp: RegExp,

    // Extensions to ECMA.
    load: function load(s) {
      if (typeof s !== "string")
        return s;

      evaluate(snarf(s), s, 1);
    },
    version: function() { return ExecutionContext.current.version; },
    quit: function() { throw END_SIGNAL; },
    assertEq: function() {
      return assertEq.apply(null, arguments);
    }
  };

  function wrapNative(name, val) {
    if (!definitions.isNativeCode(val))
      return val;
    return Proxy.createFunction(
      definitions.makePassthruHandler(val),
      function() { return val.apply(hostGlobal, arguments); },
      function() {
        var a = arguments;
        switch (a.length) {
        case 0:
          return new val();
        case 1:
          return new val(a[0]);
        case 2:
          return new val(a[0], a[1]);
        case 3:
          return new val(a[0], a[1], a[2]);
        default:
          var argStr = "";
          for (var i = 0; i < a.length; i++)
            argStr += 'a[' + i + '],';
          return eval('new ' + name + '(' + argStr.slice(0,-1) + ');');
        }
      });
  }

  var hostHandler = definitions.blacklistHandler(
    hostGlobal, Narcissus.options.hiddenHostGlobals);
  var hostHandlerGet = hostHandler.get;
  hostHandler.get = function(receiver, name) {
    return wrapNative(name, hostHandlerGet(receiver, name));
  };
  var hostProxy = Proxy.create(hostHandler);

  var globalStaticEnv;                       // global static scope
  var moduleInstances = new ObjectMap();     // maps module instance objects -> module instances
  var global = Object.create(hostProxy, {}); // exposed global object (legacy)

  // unexposed global scope record (Harmony)
  var globalScope = Object.create(hostProxy, {});

  // exposed global scope mirror (Harmony)
  var globalMirror = Proxy.create(definitions.mirrorHandler(globalScope, true));

  function resetEnvironment() {
    ExecutionContext.current = new ExecutionContext(GLOBAL_CODE,
                                                    Narcissus.options.version);
    let names = Object.getOwnPropertyNames(global);
    for (let i = 0, n = names.length; i < n; i++) {
      delete global[names[i]];
    }
    for (let key in globalScope) {
      delete globalScope[key];
    }
    moduleInstances.clear();
    globalStaticEnv = new StaticEnv();

    names = Object.getOwnPropertyNames(hostProxy);
    for (let i = 0, n = names.length; i < n; i++) {
      globalStaticEnv.bind(names[i], new Def());
    }
    for (let key in globalBase) {
      let val = globalBase[key];
      global[key] = val;
      globalScope[key] = val;
      // NB: this assumes globalBase never contains module or import bindings
      globalStaticEnv.bind(key, new Def());
    }
  }

  function populateEnvironment() {
    // Reflect Array -- note that all Array methods are generic.
    reflectClass('Array', new Array);

    // Reflect String, overriding non-generic methods.
    var gSp = reflectClass('String', new String);
    gSp.toSource = function () { return this.value.toSource(); };
    gSp.toString = function () { return this.value; };
    gSp.valueOf  = function () { return this.value; };
    global.String.fromCharCode = String.fromCharCode;

    // Connect Function.prototype and Function.prototype.constructor in global.
    reflectClass('Function', FOp);

    if (!('__call__' in Fp)) {
      definitions.defineProperty(Fp, "__call__", FpCall, true, true, true);
      definitions.defineProperty(REp, "__call__", REpCall, true, true, true);
      definitions.defineProperty(Fp, "__construct__", FpConstruct,
                                 true, true, true);

      // Since we use native functions such as Date along with host ones
      // such as global.eval, we want both to be considered instances of
      // the native Function constructor.
      definitions.defineProperty(Fp, "__hasInstance__", FpHasInstance,
                                 true, true, true);
    }

    // Fp.__hasInstance__ breaks instanceof for the native constructors.  We
    // restore this functionality.
    function addHasInstance(target, parent) {
      if (!parent) parent = target;
      definitions.defineProperty(target, "__hasInstance__",
                               function(v) { return v instanceof parent; },
                               true, true, true);
    }
    addHasInstance(globalBase.Array, Array);
    addHasInstance(globalBase.String);
    addHasInstance(Error);
    addHasInstance(TypeError);
    addHasInstance(SyntaxError);
    addHasInstance(RangeError);
    addHasInstance(ReferenceError);
    addHasInstance(EvalError);
    addHasInstance(URIError);
  }

  // resetEnvironment();

  // Helper to avoid Object.prototype.hasOwnProperty polluting scope objects.
  function hasDirectProperty(o, p) {
    return Object.prototype.hasOwnProperty.call(o, p);
  }

  // Reflect a host class into the target global environment by delegation.
  function reflectClass(name, proto) {
    var gctor = global[name];
    definitions.defineProperty(gctor, "prototype", proto, true, true, true);
    definitions.defineProperty(proto, "constructor", gctor, false, false, true);
    return proto;
  }


  ExecutionContext.current = null;

  ExecutionContext.prototype = {
    caller: null,
    callee: null,
    scope: {object: global, parent: null},
    thisObject: global,
    thisModule: null,
    result: undefined,
    target: null,
    ecma3OnlyMode: false,

    // Execute a node in this execution context.
    execute: function(n) {
      var prev = ExecutionContext.current;
      ExecutionContext.current = this;
      try {
        execute(n, this);
      } finally {
        ExecutionContext.current = prev;
      }
    }
  };

  function Reference(base, propertyName, node) {
    this.base = base;
    this.propertyName = propertyName;
    this.node = node;
  }

  Reference.prototype.toString = function () { return this.node.getSource(); };

  function getValue(v) {
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

  function putValue(v, w, vn) {
    if (v instanceof Reference)
      return (v.base || global)[v.propertyName] = w;
    throw new ReferenceError("Invalid assignment left-hand side",
                             vn.filename, vn.lineno);
  }

  function isPrimitive(v) {
    var t = typeof v;
    return (t === "object") ? v === null : t !== "function";
  }

  function isObject(v) {
    var t = typeof v;
    return (t === "object") ? v !== null : t === "function";
  }

  // If r instanceof Reference, v === getValue(r); else v === r.  If passed, rn
  // is the node whose execute result was r.
  function toObject(v, r, rn) {
    switch (typeof v) {
    case "boolean":
      return new global.Boolean(v);
    case "number":
      return new global.Number(v);
    case "string":
      return new global.String(v);
    case "function":
      return v;
    case "object":
      if (v !== null)
        return v;
    }
    var message = r + " (type " + (typeof v) + ") has no properties";
    throw rn ? new TypeError(message, rn.filename, rn.lineno)
      : new TypeError(message);
  }

  // reifyModule :: (Module) -> module instance object
  function reifyModule(mod) {
    return mod.instance.proxy;
  }

  function bindImports(impDecls, x) {
    for (var i = 0; i < impDecls.length; i++) {
      var list = impDecls[i].pathList;
      for (var j = 0; j < list.length; j++) {
        bindImport(list[j], x);
      }
    }
  }

  function bindImport(decl, x) {
    var t = x.scope.object;
    var lhs = decl.children[0];
    var rhs = decl.children[1];
    var mod = lhs.denotedModule;

    function bind(importID, exportID) {
      definitions.defineGetter(t, importID, function() {
        var m = reifyModule(mod);
        return m[exportID];
      }, true);
    }

    if (rhs.type === IDENTIFIER) {
      if (rhs.value === "*") {
        mod.exports.forEach(function(exportID, exp) {
          if (!mod.exportedModules.has(exportID))
            bind(exportID, exportID);
        });
      } else {
        bind(rhs.value, rhs.value);
      }
      return;
    }

    for (var i = 0; i < rhs.children.length; i++) {
      var pair = rhs.children[i];
      bind(pair.children[1].value, pair.children[0].value);
    }
  }

  function executeModule(n, x) {
    var m = x.scope.object[n.name];
    var inst = moduleInstances.get(m);
    var x2 = new ExecutionContext(MODULE_CODE, x.version);
    x2.scope = inst.scope;
    x2.thisObject = m;
    x2.thisModule = m;
    x2.execute(n.body);
    return m;
  }

  var executeNode = {};

  function execute(n, x) {
    if (n.type in executeNode) {
      return executeNode[n.type](n, x);
    }
    else
      throw "PANIC: unknown operation " + n.type + ": " + uneval(n);
  }

  executeNode[MODULE] = (n, x) => {
    if (n.body)
      x.result = executeModule(n, x);
  };

  executeNode[IMPORT] = (n, x) => {};
  executeNode[EXPORT] = (n, x) => {};

  executeNode[FUNCTION] = (n, x) => {
    let v;
    if (n.functionForm !== parser.DECLARED_FORM) {
      if (!n.name || n.functionForm === parser.STATEMENT_FORM) {
        v = newFunction(n, x);
        if (n.functionForm === parser.STATEMENT_FORM)
          definitions.defineProperty(x.scope.object, n.name, v, true);
      } else {
        let t = new Object;
        x.scope = {object: t, parent: x.scope};
        try {
          v = newFunction(n, x);
          definitions.defineProperty(t, n.name, v, true, true);
        } finally {
          x.scope = x.scope.parent;
        }
      }
    }
    return v;
  };

  executeNode[SCRIPT] = (n, x) => {
    let t = x.scope.object;
    n.modAssns.forEach((name, node) => {
      definitions.defineMemoGetter(t, name, function() {
        return reifyModule(node.initializer.denotedModule);
      }, true);
    });
    bindImports(n.impDecls, x);

    n.funDecls.forEach(d => {
      let s = d.name;
      let f = newFunction(d, x);
      // ECMA-262 says variable bindings created by `eval' are deleteable.
      definitions.defineProperty(t, s, f, x.type !== EVAL_CODE);
    });

    let defineVar;
    if (x.thisModule) {
      defineVar = (obj, prop) => {
        // start out as a getter/setter that throws on get
        definitions.defineGetterSetter(obj, prop, function() {
          throw new ReferenceError(prop + " is not initialized");
        }, val => {
          // on first set, replace with ordinary property
          definitions.defineProperty(obj, prop, val, false);
          return val;
        }, false);
      };
    } else {
      defineVar = (obj, prop) => {
        // ECMA-262 says variable bindings created by `eval' are deleteable.
        definitions.defineProperty(obj, prop, undefined,
                                   x.type !== EVAL_CODE, false);
      };
    }

    n.varDecls.forEach(u => {
      let s = u.name;
      if (u.readOnly && hasDirectProperty(t, s)) {
        throw new TypeError("Redeclaration of const " + s,
                            u.filename, u.lineno);
      }
      if (u.readOnly || !hasDirectProperty(t, s)) {
        // Does not correctly handle 'const x;' -- see bug 592335.
        defineVar(t, s);
      }
    });

    executeNode[BLOCK](n, x);
  };

  executeNode[BLOCK] = (n, x) => {
    n.children.forEach(c => {
      execute(c, x);
    });
  };

  executeNode[IF] = (n, x) => {
    if (getValue(execute(n.condition, x)))
      execute(n.thenPart, x);
    else if (n.elsePart)
      execute(n.elsePart, x);
  };

  executeNode[SWITCH] = (n, x) => {
    let s = getValue(execute(n.discriminant, x));
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
        u = getValue(execute(t.caseLabel, x));
      } else {
        if (!matchDefault)          // not defaulting, skip for now
          continue;
      }
      if (matchDefault || u === s) {
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
  };

  executeNode[FOR] = (n, x) => {
    n.setup && getValue(execute(n.setup, x));

    executeNode[WHILE](n, x);
  };

  executeNode[WHILE] = (n, x) => {
    while (!n.condition || getValue(execute(n.condition, x))) {
      try {
        execute(n.body, x);
      } catch (e if e === BREAK_SIGNAL && x.target === n) {
        break;
      } catch (e if e === CONTINUE_SIGNAL && x.target === n) {
        // Must run the update expression.
      }
      n.update && getValue(execute(n.update, x));
    }
  };

  executeNode[FOR_IN] = (n, x) => {
    let u = n.varDecl;
    if (u)
      execute(u, x);
    let r = n.iterator;
    let s = execute(n.object, x);
    let v = getValue(s);

    // ECMA deviation to track extant browser JS implementation behavior.
    let t = ((v === null || v === undefined) && !x.ecma3OnlyMode)
          ? v
          : toObject(v, s, n.object);
    let a = [];
    for (let i in t)
      a.push(i);
    for (let i = 0, j = a.length; i < j; ++i) {
      putValue(execute(r, x), a[i], r);
      try {
        execute(n.body, x);
      } catch (e if e === BREAK_SIGNAL && x.target === n) {
        break;
      } catch (e if e === CONTINUE_SIGNAL && x.target === n) {
        continue;
      }
    }
  };

  executeNode[DO] = (n, x) => {
    do {
      try {
        execute(n.body, x);
      } catch (e if e === BREAK_SIGNAL && x.target === n) {
        break;
      } catch (e if e === CONTINUE_SIGNAL && x.target === n) {
        continue;
      }
    } while(getValue(execute(n.condition, x)));
  };

  executeNode[BREAK] = (n, x) => {
    x.target = n.target;
    throw BREAK_SIGNAL;
  };

  executeNode[CONTINUE] = (n, x) => {
    x.target = n.target;
    throw CONTINUE_SIGNAL;
  };

  executeNode[TRY] = (n, x) => {
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
          if (t.guard && !getValue(execute(t.guard, x)))
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
  };

  executeNode[THROW] = (n, x) => {
    throw getValue(execute(n.exception, x));
  };

  executeNode[RETURN] = (n, x) => {
    // Check for returns with no return value
    x.result = n.value ? getValue(execute(n.value, x)) : undefined;
    throw RETURN_SIGNAL;
  };

  executeNode[WITH] = (n, x) => {
    let r = execute(n.object, x);
    let t = toObject(getValue(r), r, n.object);
    x.scope = {object: t, parent: x.scope};
    try {
      execute(n.body, x);
    } finally {
      x.scope = x.scope.parent;
    }
  };

  executeNode[VAR]   =
  executeNode[CONST] = (n, x) => {
    let c = n.children;
    for (let i = 0, j = c.length; i < j; i++) {
      let u = c[i].initializer;
      if (!u)
        continue;
      let t = c[i].name;
      let s;
      for (s = x.scope; s; s = s.parent) {
        if (hasDirectProperty(s.object, t))
          break;
      }
      u = getValue(execute(u, x));
      if (n.type === CONST)
        definitions.defineProperty(s.object, t, u, x.type !== EVAL_CODE, true);
      else
        s.object[t] = u;
    }
  };

  executeNode[DEBUGGER] = (n, x) => {
    throw "NYI: " + definitions.tokens[n.type];
  };

  executeNode[SEMICOLON] = (n, x) => {
    if (n.expression)
      x.result = getValue(execute(n.expression, x));
  };

  executeNode[LABEL] = (n, x) => {
    try {
      execute(n.statement, x);
    } catch (e if e === BREAK_SIGNAL && x.target === n.target) {}
  };

  executeNode[COMMA] = (n, x) => {
    let c = n.children;
    let v;
    for (let i = 0, j = c.length; i < j; i++)
      v = getValue(execute(c[i], x));
    return v;
  };

  executeNode[ASSIGN] = (n, x) => {
    let c = n.children;
    let r = execute(c[0], x);
    let t = n.assignOp;
    let u;
    if (t)
      u = getValue(r);
    let v = getValue(execute(c[1], x));
    switch (t) {
    case BITWISE_OR:  v = u | v; break;
    case BITWISE_XOR: v = u ^ v; break;
    case BITWISE_AND: v = u & v; break;
    case LSH:         v = u << v; break;
    case RSH:         v = u >> v; break;
    case URSH:        v = u >>> v; break;
    case PLUS:        v = u + v; break;
    case MINUS:       v = u - v; break;
    case MUL:         v = u * v; break;
    case DIV:         v = u / v; break;
    case MOD:         v = u % v; break;
    }
    putValue(r, v, c[0]);
    return v;
  };

  executeNode[HOOK] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) ? getValue(execute(c[1], x))
      : getValue(execute(c[2], x));
  };

  executeNode[OR] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) || getValue(execute(c[1], x));
  };

  executeNode[AND] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) && getValue(execute(c[1], x));
  };

  executeNode[BITWISE_OR] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) | getValue(execute(c[1], x));
  };

  executeNode[BITWISE_XOR] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) ^ getValue(execute(c[1], x));
  };

  executeNode[BITWISE_AND] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) & getValue(execute(c[1], x));
  };

  executeNode[EQ] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) == getValue(execute(c[1], x));
  };

  executeNode[NE] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) != getValue(execute(c[1], x));
  };

  executeNode[STRICT_EQ] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) === getValue(execute(c[1], x));
  };

  executeNode[STRICT_NE] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) !== getValue(execute(c[1], x));
  };

  executeNode[LT] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) < getValue(execute(c[1], x));
  };

  executeNode[LE] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) <= getValue(execute(c[1], x));
  };

  executeNode[GE] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) >= getValue(execute(c[1], x));
  };

  executeNode[GT] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) > getValue(execute(c[1], x));
  };

  executeNode[IN] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) in getValue(execute(c[1], x));
  };

  executeNode[INSTANCEOF] = (n, x) => {
    let c = n.children;
    let t = getValue(execute(c[0], x));
    let u = getValue(execute(c[1], x));
    if (isObject(u) && typeof u.__hasInstance__ === "function")
      return u.__hasInstance__(t);
    else
      return t instanceof u;
  };

  executeNode[LSH] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) << getValue(execute(c[1], x));
  };

  executeNode[RSH] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) >> getValue(execute(c[1], x));
  };

  executeNode[URSH] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) >>> getValue(execute(c[1], x));
  };

  executeNode[PLUS] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) + getValue(execute(c[1], x));
  };

  executeNode[MINUS] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) - getValue(execute(c[1], x));
  };

  executeNode[MUL] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) * getValue(execute(c[1], x));
  };

  executeNode[DIV] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) / getValue(execute(c[1], x));
  };

  executeNode[MOD] = (n, x) => {
    let c = n.children;
    return getValue(execute(c[0], x)) % getValue(execute(c[1], x));
  };

  executeNode[DELETE] = (n, x) => {
    let t = execute(n.children[0], x);
    return !(t instanceof Reference) || delete t.base[t.propertyName];
  };

  executeNode[VOID] = (n, x) => {
    getValue(execute(n.children[0], x));
  };

  executeNode[TYPEOF] = (n, x) => {
    let t = execute(n.children[0], x);
    if (t instanceof Reference)
      t = t.base ? t.base[t.propertyName] : undefined;
    return typeof t;
  };

  executeNode[NOT] = (n, x) => {
    let c = n.children;
    return !getValue(execute(c[0], x));
  };

  executeNode[BITWISE_NOT] = (n, x) => {
    let c = n.children;
    return ~getValue(execute(c[0], x));
  };

  executeNode[UNARY_PLUS] = (n, x) => {
    let c = n.children;
    return +getValue(execute(c[0], x));
  };

  executeNode[UNARY_MINUS] = (n, x) => {
    let c = n.children;
    return -getValue(execute(c[0], x));
  };

  executeNode[INCREMENT] =
  executeNode[DECREMENT] = (n, x) => {
    let t = execute(n.children[0], x);
    let u = Number(getValue(t));
    let v;
    if (n.postfix)
      v = u;
    putValue(t, (n.type === INCREMENT) ? ++u : --u, n.children[0]);
    if (!n.postfix)
      v = u;
    return v;
  };

  executeNode[DOT] = (n, x) => {
    let c = n.children;
    let r = execute(c[0], x);
    let t = getValue(r);
    let u = c[1].value;
    return new Reference(toObject(t, r, c[0]), u, n);
  };

  executeNode[INDEX] = (n, x) => {
    let c = n.children;
    let r = execute(c[0], x);
    let t = getValue(r);
    let u = getValue(execute(c[1], x));
    return new Reference(toObject(t, r, c[0]), String(u), n);
  };

  executeNode[LIST] = (n, x) => {
    // Curse ECMA for specifying that arguments is not an Array object!
    let v = {};
    let c = n.children;
    let i, j;
    for (i = 0, j = c.length; i < j; i++) {
      let u = getValue(execute(c[i], x));
      definitions.defineProperty(v, i, u, false, false, true);
    }
    definitions.defineProperty(v, "length", i, false, false, true);
    return v;
  };

  executeNode[CALL] = (n, x) => {
    let c = n.children;
    let r = execute(c[0], x);
    let a = execute(c[1], x);
    let f = getValue(r);
    x.staticEnv = n.staticEnv;
    if (isPrimitive(f) || typeof f.__call__ !== "function") {
      throw new TypeError(r + " is not callable", c[0].filename, c[0].lineno);
    }
    let t = (r instanceof Reference) ? r.base : null;
    if (t instanceof Activation)
      t = null;
    return f.__call__(t, a, x);
  };

  executeNode[NEW]           =
    executeNode[NEW_WITH_ARGS] = (n, x) => {
      let c = n.children;
      let r = execute(c[0], x);
      let f = getValue(r);
      let a;
      if (n.type === NEW) {
        a = {};
        definitions.defineProperty(a, "length", 0, false, false, true);
      } else {
        a = execute(c[1], x);
      }

      if (isPrimitive(f) || typeof f.__construct__ !== "function") {
        throw new TypeError(r + " is not a constructor",
                            c[0].filename, c[0].lineno);
      }
      return f.__construct__(a, x);
    };

  executeNode[ARRAY_INIT] = (n, x) => {
    let v = [];
    let c = n.children;
    let i, j;
    for (i = 0, j = c.length; i < j; i++) {
      if (c[i])
        v[i] = getValue(execute(c[i], x));
    }
    v.length = j;
    return v;
  };

  executeNode[OBJECT_INIT] = (n, x) => {
    let v = {};
    let c = n.children;
    for (let i = 0, j = c.length; i < j; i++) {
      let t = c[i];
      if (t.type === PROPERTY_INIT) {
        let c2 = t.children;
        v[c2[0].value] = getValue(execute(c2[1], x));
      } else {
        let f = newFunction(t, x);
        let u = (t.type === GETTER) ? '__defineGetter__'
              : '__defineSetter__';
        v[u](t.name, thunk(f, x));
      }
    }
    return v;
  };

  executeNode[NULL] = (n, x) => null;
  executeNode[THIS] = (n, x) => x.thisObject;
  executeNode[TRUE] = (n, x) => true;
  executeNode[FALSE] = (n, x) => false;

  executeNode[IDENTIFIER] = (n, x) => {
    let s;
    for (s = x.scope; s; s = s.parent) {
      if (n.value in s.object)
        break;
    }
    return new Reference(s && s.object, n.value, n);
  };

  executeNode[NUMBER] =
    executeNode[STRING] =
    executeNode[REGEXP] = (n, x) => n.value;

  executeNode[GROUP] = (n, x) => execute(n.children[0], x);

  function Activation(f, a) {
    for (var i = 0, j = f.params.length; i < j; i++)
      definitions.defineProperty(this, f.params[i], a[i], true);
    definitions.defineProperty(this, "arguments", a, true);
  }

  // Null Activation.prototype's proto slot so that Object.prototype.* does not
  // pollute the scope of heavyweight functions.  Also delete its 'constructor'
  // property so that it doesn't pollute function scopes.

  Activation.prototype.__proto__ = null;
  delete Activation.prototype.constructor;

  function FunctionObject(node, scope) {
    definitions.defineProperty(this, "node", node, false, false, true);
    definitions.defineProperty(this, "scope", scope, false, false, true);
    definitions.defineProperty(this, "length", node.params.length,
                               true, true, true);
    var proto = {};
    definitions.defineProperty(this, "prototype", proto, true);
    definitions.defineProperty(proto, "constructor", this, false, false, true);
  }

  /*
   * ModuleInstance :: (Module, scope) -> ModuleInstance
   *
   * Dynamic semantic representation of a module.
   */
  function ModuleInstance(mod, scope) {
    this.module = mod;
    this.scope = scope;
  }

  /*
   * newModule :: (Module, scope) -> module instance object
   *
   * Instantiates a module node, producing a module instance object.
   */
  function newModule(mod, scope) {
    var exports = mod.exports;

    // the module instance
    mod.instance = new ModuleInstance(mod, {object: new Object, parent: scope});

    function keys() {
      var result = [];
      exports.forEach(function(name, exp) {
        result.push(name);
      });
      return result;
    }

    function getExportDescriptor(name) {
      if (exports.has(name)) {
        var exp = exports.get(name);
        var inst = exp.resolved.module.instance;

        return {
          value: inst.scope.object[exp.resolved.internalID],
          writable: false,
          enumerable: true,
          configurable: true
        };
      }

      throw new ReferenceError("no such export: " + name);
    }

    function getExportValue(receiver, name) {
      return getExportDescriptor(name).value;
    }

    function hasExport(name) {
      return exports.has(name);
    }

    function refuse() { }

    // the module instance proxy
    var instObj = Proxy.create({
      getOwnPropertyDescriptor: getExportDescriptor,
      getPropertyDescriptor: getExportDescriptor,
      getOwnPropertyNames: keys,
      defineProperty: refuse,
      "delete": refuse,
      fix: refuse,
      has: hasExport,
      hasOwn: hasExport,
      get: getExportValue,
      set: refuse,
      enumerate: keys,
      keys: keys
    });

    // associate the instance with the instance proxy
    moduleInstances.set(instObj, mod.instance);
    mod.instance.proxy = instObj;

    return instObj;
  }

  function instantiateModules(n, scope) {
    n.modDefns.forEach(function(name, defn) {
      var m = defn.module;
      var instObj = newModule(m, scope);
      var inst = moduleInstances.get(instObj);
      definitions.defineProperty(scope.object, name, instObj, true, true);
      instantiateModules(m.node.body, inst.scope);
    });
  }

  function getPropertyDescriptor(obj, name) {
    while (obj) {
      if (({}).hasOwnProperty.call(obj, name))
        return Object.getOwnPropertyDescriptor(obj, name);
      obj = Object.getPrototypeOf(obj);
    }
  }

  function getOwnProperties(obj) {
    var map = {};
    for (var name in Object.getOwnPropertyNames(obj))
      map[name] = Object.getOwnPropertyDescriptor(obj, name);
    return map;
  }

  // Returns a new function wrapped with a Proxy.
  function newFunction(n, x) {
    var fobj = new FunctionObject(n, x.scope);
    var handler = definitions.makePassthruHandler(fobj);
    var p = Proxy.createFunction(
      handler,
      function() { return fobj.__call__(this, arguments, x); },
      function() { return fobj.__construct__(arguments, x); }
    );
    return p;
  }

  var FOp = FunctionObject.prototype = {

    // Internal methods.
    __call__: function (t, a, x) {
      var x2 = new ExecutionContext(FUNCTION_CODE, x.version);
      x2.thisObject = t || global;
      x2.thisModule = null;
      x2.caller = x;
      x2.callee = this;
      definitions.defineProperty(a, "callee", this, false, false, true);
      var f = this.node;
      x2.scope = {object: new Activation(f, a), parent: this.scope};

      try {
        x2.execute(f.body);
      } catch (e if e === RETURN_SIGNAL) {
        return x2.result;
      }
      return undefined;
    },

    __construct__: function (a, x) {
      var o = new Object;
      var p = this.prototype;
      if (isObject(p))
        o.__proto__ = p;
      // else o.__proto__ defaulted to Object.prototype

      var v = this.__call__(o, a, x);
      if (isObject(v))
        return v;
      return o;
    },

    __hasInstance__: function (v) {
      if (isPrimitive(v))
        return false;
      var p = this.prototype;
      if (isPrimitive(p)) {
        throw new TypeError("'prototype' property is not an object",
                            this.node.filename, this.node.lineno);
      }
      var o;
      while ((o = Object.getPrototypeOf(v))) {
        if (o === p)
          return true;
        v = o;
      }
      return false;
    },

    // Standard methods.
    toString: function () {
      return this.node.getSource();
    },

    apply: function (t, a) {
      // Curse ECMA again!
      if (typeof this.__call__ !== "function") {
        throw new TypeError("Function.prototype.apply called on" +
                            " uncallable object");
      }

      if (t === undefined || t === null)
        t = global;
      else if (typeof t !== "object")
        t = toObject(t, t);

      if (a === undefined || a === null) {
        a = {};
        definitions.defineProperty(a, "length", 0, false, false, true);
      } else if (a instanceof Array) {
        var v = {};
        for (var i = 0, j = a.length; i < j; i++)
          definitions.defineProperty(v, i, a[i], false, false, true);
        definitions.defineProperty(v, "length", i, false, false, true);
        a = v;
      } else if (!(a instanceof Object)) {
        // XXX check for a non-arguments object
        throw new TypeError("Second argument to Function.prototype.apply" +
                            " must be an array or arguments object",
                            this.node.filename, this.node.lineno);
      }

      return this.__call__(t, a, ExecutionContext.current);
    },

    call: function (t) {
      // Curse ECMA a third time!
      var a = Array.prototype.splice.call(arguments, 1);
      return this.apply(t, a);
    }
  };

  // Help native and host-scripted functions be like FunctionObjects.
  var Fp = Function.prototype;
  var REp = RegExp.prototype;

  function FpCall(t, a, x) {
    // Curse ECMA yet again!
    a = Array.prototype.slice.call(a, 0, a.length);
    return this.apply(t, a);
  }

  function REpCall(t, a, x) {
    a = Array.prototype.slice.call(a, 0, a.length);
    return this.exec.apply(this, a);
  }

  function FpConstruct(a, x) {
    a = Array.prototype.slice.call(a, 0, a.length);
    switch (a.length) {
    case 0:
      return new this();
    case 1:
      return new this(a[0]);
    case 2:
      return new this(a[0], a[1]);
    case 3:
      return new this(a[0], a[1], a[2]);
    default:
      var argStr = "";
      for (var i=0; i<a.length; i++) {
        argStr += 'a[' + i + '],';
      }
      return eval('new this(' + argStr.slice(0,-1) + ');');
    }
  }

  function FpHasInstance(v) {
    return v instanceof Function || v instanceof global.Function;
  }

  function thunk(f, x) {
    return function () { return f.__call__(this, arguments, x); };
  }

  function resolveGlobal(ast) {
    // clone the static env so we can rollback if compilation fails
    var extendedStaticEnv = globalStaticEnv.copy();
    resolver.resolve(ast, extendedStaticEnv);
    // compilation succeeded, so commit to the extended static env
    globalStaticEnv = extendedStaticEnv;
  }

  function evaluate(s, f, l) {
    if (typeof s !== "string")
      return s;

    var x = new ExecutionContext(GLOBAL_CODE, Narcissus.options.version);
    var ast = parser.parse(s, f, l);
    if (Narcissus.options.desugarExtensions)
      ast = desugaring.desugar(ast);
    if (x.version === "harmony") {
      resolveGlobal(ast);
      instantiateModules(ast, x.scope);
    }
    x.execute(ast);
    return x.result;
  }

  function printStackTrace(stack) {
    var st = String(stack).split(/\n/);
    // beautify stack trace:
    //   - eliminate blank lines
    //   - sanitize confusing trace lines for getters and js -e expressions
    //   - simplify source location reporting
    //   - indent
    for (var i = 0; i < st.length; i++) {
      var line = st[i].trim();
      if (line) {
        line = line.replace(/^(\(\))?@/, "<unknown>@");
        line = line.replace(/@(.*\/|\\)?([^\/\\]+:[0-9]+)/, " at $2");
        print("    in " + line);
      }
    }
  }

  var repl_prompt = "njs-base> ";

  // A read-eval-print-loop that roughly tracks the behavior of the js shell.
  function repl() {

    // Display a value similarly to the js shell.
    function display(x) {
      if (typeof x === "object") {
        // At the js shell, objects with no |toSource| don't print.
        if (x !== null && "toSource" in x) {
          try {
            print(x.toSource());
          } catch (e) {
          }
        } else {
          print("null");
        }
      } else if (typeof x === "string") {
        print(uneval(x));
      } else if (typeof x !== "undefined") {
        // Since x must be primitive, String can't throw.
        print(String(x));
      }
    }

    // String conversion that never throws.
    function string(x) {
      try {
        return String(x);
      } catch (e) {
        return "unknown (can't convert to string)";
      }
    }

    const BREAK_INTERACTION = {};

    // isCommand :: (string) -> boolean
    function isCommand(line) {
      switch (line.trim()) {
      case ".help":
        print(".begin  Begin multiline input mode.");
        print(".break  Sometimes you get stuck in a place you can't get out... This will get you out.");
        print(".clear  Break, and also clear the global environment.");
        print(".end    End multiline input mode.");
        print(".exit   Exit the prompt.");
        print(".help   Show repl options.");
        return true;

      case ".clear":
        resetEnvironment();
        // FALL THROUGH

      case ".break":
        throw BREAK_INTERACTION;

      case ".exit":
        throw END_SIGNAL;
      }
      return false;
    }

    var x = new ExecutionContext(GLOBAL_CODE, Narcissus.options.version);

    // Line number in/out parameter to parser.parseStdin.
    var ln = {value: 0};

    ExecutionContext.current = x;
    for (;;) {
      x.result = undefined;
      putstr(repl_prompt);
      var src = readline();

      // If readline receives EOF it returns null.
      if (src === null) {
        print("");
        break;
      }
      ++ln.value;

      try {
        var ast = parser.parseStdin(src, ln, "...  ", isCommand);
        if (Narcissus.options.desugarExtensions)
          ast = desugaring.desugar(ast);
        if (x.version === "harmony") {
          resolveGlobal(ast);
          instantiateModules(ast, x.scope);
        }
        execute(ast, x);
        display(x.result);
      } catch (e if e === END_SIGNAL) {
        break;
      } catch (e if e === BREAK_INTERACTION) {
        continue;
      } catch (e if e instanceof SyntaxError) {
        const PREFIX = (e.filename || "stdin") + ":" + e.lineNumber + ": ";
        print(PREFIX + e.toString());
        print(PREFIX + e.source);
        print(PREFIX + ".".repeat(e.cursor) + "^");
      } catch (e if e instanceof Error) {
        print((e.filename || "stdin") + ":" +  e.lineNumber + ": " + e.toString());
        if (e.stack)
          printStackTrace(e.stack);
      } catch (e) {
        print("unexpected Narcissus exception (" + e + ")");
        throw e;
      }
    }
    ExecutionContext.current = null;
  }

  function test(thunk) {
    try {
      thunk();
    } catch (e) {
      print(e.fileName + ":" + e.lineNumber + ": " + e.name + ": " + e.message);
      printStackTrace(e.stack);
      print(e.message);
      return false;
    }
    return true;
  }

  return {
    // resetEnvironment wipes any properties added externally to global,
    // but properties added to globalBase will persist.
    global,
    globalBase,
    resetEnvironment,
    populateEnvironment,
    evaluate,
    getValueHook: null,
    repl,
    test,

    // Exposed functions
    // FIXME: Should be everything
    _: {ExecutionContext,
        getCurrentExecutionContext,
        getValue,
        Reference,
        executeNode,
        execute,
        global,
        globalBase,
        isObject,
        toObject,
        isPrimitive,
        Activation,
        BREAK_SIGNAL,
        CONTINUE_SIGNAL
       },

    // Instrumentation scope
    ___
  };

  } // End of with(I)
}());
