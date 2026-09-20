import db, { cuid } from '../../lib/db';
function nowIso(){ return new Date().toISOString(); }

export const SENEGAL_REGIONS = [
  { name: 'Dakar', code: 'DK', departments: [{ name: 'Dakar', communes: ['Dakar-Plateau','Médina','Grand Dakar'] }, { name: 'Pikine', communes: ['Pikine','Guédiawaye'] }] },
  { name: 'Thiès', code: 'TH', departments: [{ name: 'Thiès', communes: ['Thiès','Tivaouane'] }, { name: 'Mbour', communes: ['Mbour','Joal'] }] },
  { name: 'Diourbel', code: 'DB', departments: [{ name: 'Diourbel', communes: ['Diourbel','Bambey'] }] },
  { name: 'Saint-Louis', code: 'SL', departments: [{ name: 'Saint-Louis', communes: ['Saint-Louis','Dagana'] }] },
  { name: 'Ziguinchor', code: 'ZG', departments: [{ name: 'Ziguinchor', communes: ['Ziguinchor','Bignona'] }] },
  { name: 'Kaolack', code: 'KL', departments: [{ name: 'Kaolack', communes: ['Kaolack','Guinguinéo'] }] },
  { name: 'Louga', code: 'LG', departments: [{ name: 'Louga', communes: ['Louga','Kébémer'] }] },
  { name: 'Fatick', code: 'FK', departments: [{ name: 'Fatick', communes: ['Fatick','Foundiougne'] }] },
  { name: 'Kolda', code: 'KD', departments: [{ name: 'Kolda', communes: ['Kolda','Vélingara'] }] },
  { name: 'Matam', code: 'MT', departments: [{ name: 'Matam', communes: ['Matam','Kanel'] }] },
  { name: 'Kaffrine', code: 'KF', departments: [{ name: 'Kaffrine', communes: ['Kaffrine','Malem Hodar'] }] },
  { name: 'Sédhiou', code: 'SE', departments: [{ name: 'Sédhiou', communes: ['Sédhiou','Bounkiling'] }] },
  { name: 'Tambacounda', code: 'TC', departments: [{ name: 'Tambacounda', communes: ['Tambacounda','Bakel'] }] },
  { name: 'Kédougou', code: 'KE', departments: [{ name: 'Kédougou', communes: ['Kédougou','Saraya'] }] },
];

export async function seedRegions() {
  for (const reg of SENEGAL_REGIONS) {
    let region = db.prepare('SELECT * FROM regions WHERE code = ?').get(reg.code) as any;
    if (!region) {
      const id = cuid();
      db.prepare('INSERT INTO regions (id, name, code, createdAt) VALUES (?,?,?,?)').run(id, reg.name, reg.code, nowIso());
      region = { id, name: reg.name, code: reg.code };
    }
    for (const dep of reg.departments) {
      let department = db.prepare('SELECT * FROM departments WHERE name = ? AND regionId = ?').get(dep.name, region.id) as any;
      if (!department) {
        const depId = cuid();
        db.prepare('INSERT INTO departments (id, name, regionId) VALUES (?,?,?)').run(depId, dep.name, region.id);
        department = { id: depId, name: dep.name };
      }
      for (const comName of dep.communes) {
        const exists = db.prepare('SELECT * FROM communes WHERE name = ? AND departmentId = ?').get(comName, department.id) as any;
        if (!exists) {
          db.prepare('INSERT INTO communes (id, name, departmentId) VALUES (?,?,?)').run(cuid(), comName, department.id);
        }
      }
    }
  }
}

export async function listRegions() {
  const regions = db.prepare('SELECT * FROM regions').all() as any[];
  return regions.map(r=>{
    const deps = db.prepare('SELECT * FROM departments WHERE regionId = ?').all(r.id) as any[];
    const depsWithCommunes = deps.map(d=>{
      const communes = db.prepare('SELECT * FROM communes WHERE departmentId = ?').all(d.id);
      return { ...d, communes };
    });
    return { ...r, departments: depsWithCommunes };
  });
}
