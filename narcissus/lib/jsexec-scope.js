(function(){
  let Narcissus = this.Narcissus;
  let interpreter = Narcissus.interpreter;
  let definitions = Narcissus.definitions;

  // Import constants in scope
  eval(definitions.consts);

  // Exposed bindings from the interpreter
  let _ = interpreter._;


  let scopeObjects = new Set();

  let objectNames = new Map();
  let nameObjects = new Map();
  let nameCounter = 0;

  function objectName(o) {
    if (!objectNames.has(o)) {
      let name = 'o' + (nameCounter++);
      objectNames.set(o, name);
      nameObjects.set(name, o);
    }

    return objectNames.get(o);
  }

  let nodes = new Set();
  let refEdges = [];
  let protoEdges = [];
  let parentEdges = [];

  // Construct object graph from collected scopeObjects.
  function constructGraph(depth, whitelist, blacklist) {
    scopeObjects.forEach(function(o) {
      addNode(o, 0);
    });

    function addNode(o, d) {
      if (blacklist.has(o)) return;
      if (d > depth) return;
      if (nodes.has(o)) return;

      nodes.add(o);
      let p = Object.getPrototypeOf(o);

      if (p) {
        addNode(p, d + 1);
        protoEdges.push({from: o, to: p});
      }

      Object.getOwnPropertyNames(o).forEach(function(prop) {
        if (whitelist.has(o) && !whitelist.get(o).has(prop))
          return;

        let v;
        // Looking up a property can blow up.
        // TypeError: name method called on incompatible CType
        try { v = o[prop]; } catch (e) {}
        let t = typeof v;
        if (v != null && (t === 'object' || t === 'function')) {
          addNode(o[prop], d + 1);
          refEdges.push({from: o, to: o[prop], name: prop});
        }
      });
    }
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Additions to global object

  let globalBase = Object.create(_.globalBase);

  globalBase.printScope = function printScope(depth, whitelist, blacklist) {
    depth = depth || 1;
    whitelist = whitelist || new Map();
    blacklist = blacklist || new Set();
    constructGraph(depth, whitelist, blacklist);

    print('digraph {');
    print('node [shape = record];');

    nodes.forEach(function(n) {
      let label = Object.getOwnPropertyNames(n)
            .map(function(prop) {
              if (whitelist.has(n) && !whitelist.get(n).has(prop))
                return undefined;

              let v;
              // Looking up a property can blow up.
              // TypeError: name method called on incompatible CType
              try { v = n[prop]; } catch (e) {}
              let t = typeof v;
              if (v != null && t === 'object')
                v = '•';

              if (t === 'function')
                v = '•';

              if (t === 'symbol')
                v = 'symbol';

              // Cannot have a port named 'node'
              if (prop === 'node')
                prop = '_node';

              // Ensure the string is on one line, and does not contain
              // characters used by the dot language.
              let s = ('' + v).replace(/\n|\r|\{|\}|\||"|<|>/g, ' ');

              // Cut after 10 chars
              s = s.substr(0,10);
              return `{${prop} | <${prop}> ${s}}`;
            }).filter(s => s != null).join('|');
      print(objectName(n), `[label = "{${label}}"]`);
    });

    blacklist.forEach(function(name, obj) {
      print(objectName(obj), `[label = "${name}"]`);
    });

    protoEdges.forEach(function(e) {
      print(objectName(e.from), '->', objectName(e.to), '[style = dashed]');
    });

    refEdges.forEach(function(e) {
      if (whitelist.has(e.from) && !whitelist.get(e.from).has(e.name))
        return;

      // Cannot have a port named 'node'
      if (e.name === 'node') e.name = '_node';
      print(`${objectName(e.from)}:${e.name}`, '->', objectName(e.to));
    });

    print('}');
  };

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // New executeNode, FunctionObject

  let executeNode = Object.create(_.executeNode);

  function execute(n, x) {
    scopeObjects.add(x.scope);
    return _.execute(n, x);
  }

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Instrument the interpreter

  let instrument = interpreter.___;

  instrument.execute = execute;
  instrument.globalBase = globalBase;

}());
