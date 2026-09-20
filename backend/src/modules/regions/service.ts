import db, { cuid } from '../../lib/db';
function nowIso(){ return new Date().toISOString(); }

/**
 * Découpage administratif du Sénégal : 14 régions / 46 départements (données officielles, dont le
 * département de Keur Massar créé en 2021). Les communes listées sont les chefs-lieux et quelques communes
 * urbaines — liste NON exhaustive (≈ 550 communes au total) : rien n'est inventé, on complète par la donnée.
 */
export const SENEGAL_REGIONS = [
  { name: 'Dakar', code: 'DK', departments: [
    { name: 'Dakar', communes: ['Dakar-Plateau','Médina','Grand Dakar','Fann-Point E-Amitié','Gueule Tapée-Fass-Colobane','Parcelles Assainies','Grand Yoff','Yoff','Ngor','Ouakam','Mermoz-Sacré-Cœur','HLM','Biscuiterie','Dieuppeul-Derklé','Sicap-Liberté','Hann Bel-Air','Cambérène','Patte d\'Oie'] },
    { name: 'Guédiawaye', communes: ['Guédiawaye','Golf Sud','Sam Notaire','Ndiarème Limamoulaye','Wakhinane Nimzatt','Médina Gounass'] },
    { name: 'Keur Massar', communes: ['Keur Massar Nord','Keur Massar Sud','Malika','Yeumbeul Nord','Yeumbeul Sud','Jaxaay-Parcelles'] },
    { name: 'Pikine', communes: ['Pikine','Pikine Est','Pikine Nord','Pikine Ouest','Thiaroye Gare','Thiaroye-sur-Mer','Diamaguène Sicap Mbao','Mbao','Keur Mbaye Fall','Dalifort','Djidah Thiaroye Kao','Guinaw Rail Nord','Guinaw Rail Sud','Tivaouane Diacksao'] },
    { name: 'Rufisque', communes: ['Rufisque','Rufisque Est','Rufisque Nord','Rufisque Ouest','Bargny','Diamniadio','Sébikotane','Sangalkam','Jaxaay','Bambilor','Yène','Sendou','Tivaouane Peulh-Niaga'] },
  ] },
  { name: 'Thiès', code: 'TH', departments: [
    { name: 'Thiès', communes: ['Thiès','Thiès Est','Thiès Nord','Thiès Ouest','Khombole','Pout','Kayar'] },
    { name: 'Mbour', communes: ['Mbour','Joal','Joal-Fadiouth','Saly Portudal','Ngaparou','Somone','Popenguine-Ndayane','Thiadiaye','Nguékokh','Fissel','Sandiara'] },
    { name: 'Tivaouane', communes: ['Tivaouane','Mékhé','Mboro','Pambal','Mérina Dakhar'] },
  ] },
  { name: 'Diourbel', code: 'DB', departments: [
    { name: 'Diourbel', communes: ['Diourbel','Ndoulo','Ndindy'] },
    { name: 'Bambey', communes: ['Bambey','Baba Garage','Lambaye'] },
    { name: 'Mbacké', communes: ['Mbacké','Touba Mosquée','Kael','Taïf'] },
  ] },
  { name: 'Saint-Louis', code: 'SL', departments: [
    { name: 'Saint-Louis', communes: ['Saint-Louis','Mpal','Rao','Gandon'] },
    { name: 'Dagana', communes: ['Dagana','Richard-Toll','Rosso-Sénégal','Ross Béthio','Mbane'] },
    { name: 'Podor', communes: ['Podor','Ndioum','Golléré','Aéré Lao','Pété','Thillé Boubacar'] },
  ] },
  { name: 'Ziguinchor', code: 'ZG', departments: [
    { name: 'Ziguinchor', communes: ['Ziguinchor','Niaguis','Nyassia'] },
    { name: 'Bignona', communes: ['Bignona','Thionck Essyl','Diouloulou','Tenghory'] },
    { name: 'Oussouye', communes: ['Oussouye','Diembéring','Mlomp'] },
  ] },
  { name: 'Kaolack', code: 'KL', departments: [
    { name: 'Kaolack', communes: ['Kaolack','Kahone','Ndoffane','Sibassor','Gandiaye'] },
    { name: 'Guinguinéo', communes: ['Guinguinéo','Mboss','Ngathie Naoudé'] },
    { name: 'Nioro du Rip', communes: ['Nioro du Rip','Keur Madiabel','Médina Sabakh','Paoskoto'] },
  ] },
  { name: 'Louga', code: 'LG', departments: [
    { name: 'Louga', communes: ['Louga','Ndiagne','Sakal','Kelle Guèye'] },
    { name: 'Kébémer', communes: ['Kébémer','Ndande','Guéoul','Diokoul Diawrigne'] },
    { name: 'Linguère', communes: ['Linguère','Dahra','Barkédji','Kamb'] },
  ] },
  { name: 'Fatick', code: 'FK', departments: [
    { name: 'Fatick', communes: ['Fatick','Diakhao','Diofior','Fimela','Dioffior'] },
    { name: 'Foundiougne', communes: ['Foundiougne','Sokone','Karang','Passy','Soum','Toubacouta'] },
    { name: 'Gossas', communes: ['Gossas','Colobane','Ouadiour'] },
  ] },
  { name: 'Kolda', code: 'KD', departments: [
    { name: 'Kolda', communes: ['Kolda','Dabo','Salikégné','Saré Yoba Diéga'] },
    { name: 'Vélingara', communes: ['Vélingara','Diaobé-Kabendou','Kounkané','Pakour'] },
    { name: 'Médina Yoro Foulah', communes: ['Médina Yoro Foulah','Pata','Fafacourou'] },
  ] },
  { name: 'Matam', code: 'MT', departments: [
    { name: 'Matam', communes: ['Matam','Ourossogui','Thilogne','Nguidjilone'] },
    { name: 'Kanel', communes: ['Kanel','Semmé','Waoundé','Ouro Sidy','Hamady Ounaré'] },
    { name: 'Ranérou-Ferlo', communes: ['Ranérou','Vélingara Ferlo','Oudalaye','Lougré Thioly'] },
  ] },
  { name: 'Kaffrine', code: 'KF', departments: [
    { name: 'Kaffrine', communes: ['Kaffrine','Nganda','Kathiote','Diamagadio'] },
    { name: 'Malem Hodar', communes: ['Malem Hodar','Darou Minam II','Sagna'] },
    { name: 'Birkelane', communes: ['Birkelane','Keur Mboucki','Mabo','Diamal'] },
    { name: 'Koungheul', communes: ['Koungheul','Missirah Wadène','Ida Mouride','Lour Escale'] },
  ] },
  { name: 'Sédhiou', code: 'SE', departments: [
    { name: 'Sédhiou', communes: ['Sédhiou','Marsassoum','Diannah Malary','Diendé'] },
    { name: 'Bounkiling', communes: ['Bounkiling','Madina Wandifa','Ndiamacouta','Diaroumé'] },
    { name: 'Goudomp', communes: ['Goudomp','Samine','Diattacounda','Tanaff'] },
  ] },
  { name: 'Tambacounda', code: 'TC', departments: [
    { name: 'Tambacounda', communes: ['Tambacounda','Koussanar','Missirah','Makacolibantang'] },
    { name: 'Bakel', communes: ['Bakel','Diawara','Kidira','Moudéry','Gabou'] },
    { name: 'Goudiry', communes: ['Goudiry','Kothiary','Bala','Koulor'] },
    { name: 'Koumpentoum', communes: ['Koumpentoum','Malem Niani','Payar','Kouthiaba Wolof'] },
  ] },
  { name: 'Kédougou', code: 'KE', departments: [
    { name: 'Kédougou', communes: ['Kédougou','Bandafassi','Dindéfélo','Fongolimbi','Ninéfécha'] },
    { name: 'Saraya', communes: ['Saraya','Khossanto','Bembou','Sabodala'] },
    { name: 'Salemata', communes: ['Salemata','Dakatéli','Kévoye','Ethiolo'] },
  ] },
];

/** Communes historiquement rattachées au mauvais département dans les seeds V1 (corrigées par le seed V3). */
const MISPLACED_COMMUNES: { commune: string; wrongDepartment: string; region: string }[] = [
  { commune: 'Guédiawaye', wrongDepartment: 'Pikine', region: 'Dakar' },
  { commune: 'Tivaouane', wrongDepartment: 'Thiès', region: 'Thiès' },
];

export const SENEGAL_DEPARTMENTS_COUNT = SENEGAL_REGIONS.reduce((n, r) => n + r.departments.length, 0);

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
  // Correction des rattachements erronés hérités des seeds V1 (uniquement si aucune boutique n'y est liée)
  for (const fix of MISPLACED_COMMUNES) {
    const row = db.prepare(`SELECT c.id FROM communes c JOIN departments d ON d.id = c.departmentId JOIN regions r ON r.id = d.regionId
      WHERE c.name = ? AND d.name = ? AND r.name = ?`).get(fix.commune, fix.wrongDepartment, fix.region) as any;
    if (!row) continue;
    const used = db.prepare('SELECT 1 FROM stores WHERE communeId = ? LIMIT 1').get(row.id);
    if (!used) db.prepare('DELETE FROM communes WHERE id = ?').run(row.id);
  }
}

/** Arbre régions → départements → communes en 3 requêtes (V3 perf, plus de N+1). */
export async function listRegions() {
  const regions = db.prepare('SELECT * FROM regions ORDER BY name').all() as any[];
  const deps = db.prepare('SELECT * FROM departments ORDER BY name').all() as any[];
  const communes = db.prepare('SELECT * FROM communes ORDER BY name').all() as any[];
  const communesByDep = new Map<string, any[]>();
  for (const c of communes) { if (!communesByDep.has(c.departmentId)) communesByDep.set(c.departmentId, []); communesByDep.get(c.departmentId)!.push(c); }
  const depsByRegion = new Map<string, any[]>();
  for (const d of deps) { if (!depsByRegion.has(d.regionId)) depsByRegion.set(d.regionId, []); depsByRegion.get(d.regionId)!.push({ ...d, communes: communesByDep.get(d.id) || [] }); }
  return regions.map(r=>({ ...r, departments: depsByRegion.get(r.id) || [] }));
}

export async function listDepartments(regionId?: string) {
  if (regionId) return db.prepare('SELECT * FROM departments WHERE regionId = ? ORDER BY name').all(regionId);
  return db.prepare('SELECT d.*, r.name AS regionName FROM departments d JOIN regions r ON r.id = d.regionId ORDER BY r.name, d.name').all();
}

export async function listCommunes(departmentId: string) {
  return db.prepare('SELECT * FROM communes WHERE departmentId = ? ORDER BY name').all(departmentId);
}
