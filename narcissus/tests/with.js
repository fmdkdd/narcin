var m = (function() {
  var scope = {};
  with (scope) {
    var a = 1;
    return {a:a, scope:scope};
  }
}());

m.scope.a = 2;

var whitelist = new Map();
whitelist.set(this, new Set(['m']));
var blacklist = new Map();
blacklist.set(Object.prototype, 'Object.prototype');
blacklist.set(Object.getPrototypeOf(this), 'global.prototype');
printScope(2, whitelist, blacklist);
