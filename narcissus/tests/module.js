var m = (function() {
  var a = 1;
  return {a:a};
}());

var whitelist = new Map();
whitelist.set(this, new Set(['m']));
var blacklist = new Map();
blacklist.set(Object.prototype, 'Object.prototype');
blacklist.set(Object.getPrototypeOf(this), 'global.prototype');
printScope(2, whitelist, blacklist);
whitelist.set(this, new Set(['m']));
printScope(1, whitelist);
