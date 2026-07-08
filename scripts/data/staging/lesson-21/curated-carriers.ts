// Hand-authored carrier sentences for derived forms the lesson's own staged text
// never uses (root cause (a) in docs/plans/2026-07-08-affix-trainer-quick-wins.md
// §5-findings: the bare -kan pool is frequency-selected, decoupled from the
// lesson's sentences). Consumed by scripts/generate-morphology-patterns.ts as the
// HIGHEST-priority carrier source; each value must contain its key as a whole
// word (blankDerivedInCarrier gate — validated loud at generation time).
export const curatedCarriers: Record<string, string> = {
  lakukan: 'Lakukan pekerjaan itu dengan hati-hati.',
  katakan: 'Katakan yang sebenarnya kepada ibumu.',
  berikan: 'Berikan buku ini kepada adikmu.',
  hentikan: 'Hentikan mobil itu di depan rumah.',
  inginkan: 'Ini hadiah yang selalu saya inginkan.',
  dengarkan: 'Dengarkan baik-baik kata gurumu.',
  dapatkan: 'Hadiah itu bisa kamu dapatkan besok.',
  lepaskan: 'Lepaskan sepatumu sebelum masuk rumah.',
  pikirkan: 'Pikirkan dulu sebelum kamu menjawab.',
  bicarakan: 'Masalah ini akan kita bicarakan besok.',
  tinggalkan: 'Jangan tinggalkan tasmu di dalam bus.',
  lupakan: 'Lupakan saja kejadian kemarin itu.',
  ceritakan: 'Ceritakan pengalamanmu di Bali kepada kami.',
  keluarkan: 'Keluarkan bukumu dari dalam tas.',
  letakkan: 'Letakkan gelas itu di atas meja.',
  selamatkan: 'Selamatkan dirimu sebelum terlambat!',
  selesaikan: 'Selesaikan tugasmu sebelum makan malam.',
  matikan: 'Matikan lampu sebelum kamu tidur.',
  kerjakan: 'Kerjakan latihan ini di rumah.',
  bersihkan: 'Bersihkan kamarmu setiap hari Minggu.',
  ucapkan: 'Ucapkan terima kasih kepada nenekmu.',
  mainkan: 'Mainkan lagu itu sekali lagi.',
}
