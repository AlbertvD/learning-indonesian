// Hand-authored carrier sentences for derived forms the lesson's own staged text
// never uses naturally (docs/plans/2026-07-08-affix-trainer-quick-wins.md
// §5-findings: bare -an is pedagogically homed at L10, whose text the L25
// harvest structurally cannot see; L25's own grammar section teaches pe-…-an).
// 'kemudian' is NOT listed — its harvested carrier is genuine. 'pilihan' and
// 'ujian' ARE listed to override their junk harvested fragments (a slash-list
// and a stray-paren artifact). Consumed by scripts/generate-morphology-patterns.ts
// as the HIGHEST-priority carrier source; each value must contain its key as a
// whole word (blankDerivedInCarrier gate — validated loud at generation time).
export const curatedCarriers: Record<string, string> = {
  // pe-…-an: the case-insensitive harvest (this PR's blankDerivedInCarrier fix)
  // now finds "Pembangunan jalan baru itu memakan waktu lama.)" — same sentence,
  // stray trailing paren (the §5-findings extractSentences artifact). Override
  // with the clean form; penjelasan's new harvest is clean and stays harvested.
  pembangunan: 'Pembangunan jalan baru itu memakan waktu lama.',
  makanan: 'Makanan di warung itu enak sekali.',
  bantuan: 'Kami minta bantuan kepada polisi.',
  pilihan: 'Ini pilihan yang paling baik untukmu.',
  hubungan: 'Hubungan kedua negara itu sangat baik.',
  pikiran: 'Pikiran saya sedang tidak tenang hari ini.',
  pakaian: 'Pakaian kotor itu ada di kamar mandi.',
  ruangan: 'Ruangan ini terlalu panas untuk rapat.',
  catatan: 'Jangan lupa membawa catatan pelajaranmu.',
  panggilan: 'Ada panggilan telepon untukmu dari kantor.',
  minuman: 'Minuman dingin ini cocok untuk siang hari.',
  harapan: 'Anak itu menjadi harapan keluarganya.',
  urusan: 'Ini bukan urusan kamu.',
  latihan: 'Latihan ini harus selesai hari ini.',
  jawaban: 'Jawaban kamu benar semua.',
  kotoran: 'Kotoran kucing itu harus segera dibersihkan.',
  pasangan: 'Mereka pasangan yang serasi sekali.',
  lapangan: 'Anak-anak bermain bola di lapangan.',
  jalanan: 'Jalanan kota macet setiap pagi.',
  tekanan: 'Dia bekerja di bawah tekanan besar.',
  kejutan: 'Kami menyiapkan kejutan untuk ulang tahunnya.',
  ujian: 'Saya harus belajar untuk ujian besok.',
}
