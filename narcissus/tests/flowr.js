function Patient() {}
Patient.prototype.generate_anonymised_record = function generate_anonymised_record() {};
Patient.prototype.get_record = function get_record() {};

setTag(Patient, 'receive', 'medical', 1);
setTag(Patient, 'receive', 'default', 0);

setTag(Patient.prototype.generate_anonymised_record, 'send', 'medical', 0);
setTag(Patient.prototype.get_record, 'send', 'medical', 1);
setTag(Patient, 'receive', 'internal', 0);
setTag(Patient, 'receive', 'sensitive', 0);

function PublicData() {}
PublicData.prototype.add = function add() {};

setTag(PublicData, 'receive', 'medical', 0);
setTag(PublicData, 'receive', 'internal', 0);
setTag(PublicData, 'receive', 'sensitive', 0);

var p = new Patient();
var d = new PublicData();

d.add(p.generate_anonymised_record());
try { d.add(p.get_record()); } catch (e) { print(e); }

function f() {}
f();
