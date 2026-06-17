// Lesson 13 — meN- application tier (morphology phase-b pilot, hand-authored
// 2026-06-17). Each pair: an existing learning_item root → its meN- derived form,
// tagged with the nasalisation allomorph class and the L13 grammar pattern that
// teaches it (patternSourceRef = the real grammar_patterns.slug — the cap stage
// resolves it to grammar_pattern_id). Roots verified to exist as learning_items.
//
// Pattern slugs (live, L13 "Tukar Uang"):
//   A1 = l13-a1-me-zonder-verandering-me                            (me- no change)
//   A2 = l13-a2-me-met-aangepast-voorvoegsel-mem-men-meng           (mem-/men-/meng-, no sound drop)
//   B  = l13-b-me-met-verandering-van-de-eerste-klank-k-p-s-t       (K/P/S/T drop)

const A1 = 'l13-a1-me-zonder-verandering-me'
const A2 = 'l13-a2-me-met-aangepast-voorvoegsel-mem-men-meng'
const B = 'l13-b-me-met-verandering-van-de-eerste-klank-k-p-s-t'

const prefix = (
  root: string,
  derived: string,
  allomorphClass: string,
  patternSourceRef: string,
  allomorphRule: string,
) => ({
  id: `men-${root}-${derived}`,
  sourceRef: `lesson-13/morphology/meN-${root}-${derived}`,
  patternSourceRef,
  root,
  derived,
  allomorphRule,
  affixType: 'prefix' as const,
  affixGloss: 'meN- — actieve (bedrijvende) werkwoordsvorm',
  allomorphClass,
  productive: true,
})

export const affixedFormPairs = [
  // A1 — me- (geen klankverandering): l/m/n/r/w/y-stammen
  prefix('masak', 'memasak', 'me', A1, 'meN- blijft me- voor m: masak → memasak.'),
  prefix('lihat', 'melihat', 'me', A1, 'meN- blijft me- voor l: lihat → melihat.'),

  // A2 — mem-/men-/meng- (aangepast voorvoegsel, geen klank valt weg)
  prefix('baca', 'membaca', 'mem', A2, 'meN- wordt mem- voor b: baca → membaca.'),
  prefix('beli', 'membeli', 'mem', A2, 'meN- wordt mem- voor b: beli → membeli.'),
  prefix('cari', 'mencari', 'men', A2, 'meN- wordt men- voor c: cari → mencari.'),
  prefix('dengar', 'mendengar', 'men', A2, 'meN- wordt men- voor d: dengar → mendengar.'),
  prefix('jual', 'menjual', 'men', A2, 'meN- wordt men- voor j: jual → menjual.'),
  prefix('ganti', 'mengganti', 'meng', A2, 'meN- wordt meng- voor g: ganti → mengganti.'),
  prefix('ambil', 'mengambil', 'meng', A2, 'meN- wordt meng- voor een klinker: ambil → mengambil.'),

  // B — K/P/S/T: de beginklank valt weg
  prefix('tulis', 'menulis', 'men', B, 'meN- wordt men- voor t, en de t valt weg: tulis → menulis.'),
  prefix('tukar', 'menukar', 'men', B, 'meN- wordt men- voor t, en de t valt weg: tukar → menukar.'),
  prefix('pukul', 'memukul', 'mem', B, 'meN- wordt mem- voor p, en de p valt weg: pukul → memukul.'),
  prefix('potong', 'memotong', 'mem', B, 'meN- wordt mem- voor p, en de p valt weg: potong → memotong.'),
  prefix('kirim', 'mengirim', 'meng', B, 'meN- wordt meng- voor k, en de k valt weg: kirim → mengirim.'),
]
