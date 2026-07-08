// Hand-authored carrier sentences for derived forms the lesson's own staged text
// never uses (root cause (a) in docs/plans/2026-07-08-affix-trainer-quick-wins.md
// §5-findings: the bare -i pool is frequency-selected, decoupled from the
// lesson's sentences). Consumed by scripts/generate-morphology-patterns.ts as the
// HIGHEST-priority carrier source; each value must contain its key as a whole
// word (blankDerivedInCarrier gate — validated loud at generation time).
export const curatedCarriers: Record<string, string> = {
  mulai: 'Kelas bahasa Indonesia mulai jam delapan.',
  alami: 'Hal seperti ini pernah saya alami sendiri.',
  tangani: 'Masalah ini akan dia tangani besok.',
  cintai: 'Cintai keluargamu selama mereka masih ada.',
  hargai: 'Hargai pendapat orang lain dalam rapat.',
  pahami: 'Pahami dulu soalnya sebelum kamu menjawab.',
  percayai: 'Dia orang yang bisa kamu percayai.',
  jalani: 'Jalani hidup ini dengan sabar.',
  datangi: 'Rumah itu sering dia datangi sore hari.',
  tutupi: 'Jangan tutupi kesalahanmu dengan alasan baru.',
  penuhi: 'Penuhi janjimu kepada teman-temanmu.',
  punyai: 'Ini satu-satunya sepeda yang kami punyai.',
  tiduri: 'Kasur baru itu belum pernah dia tiduri.',
  kenai: 'Sasaran itu berhasil dia kenai dari jauh.',
  namai: 'Anak itu mereka namai Putri.',
  pandangi: 'Lukisan itu dia pandangi lama-lama.',
  racuni: 'Jangan racuni pikiranmu dengan berita buruk.',
  basahi: 'Basahi handuk ini dengan air hangat.',
}
