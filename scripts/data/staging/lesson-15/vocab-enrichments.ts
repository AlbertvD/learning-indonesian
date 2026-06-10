export const vocabEnrichments = [
  // ── Nouns ──────────────────────────────────────────────────────────────
  {
    learning_item_slug: 'alat',
    recognition_distractors_nl: ['materiaal', 'gereedschap', 'pop'],
    cued_recall_distractors_id: ['kelir', 'lampu', 'peti'],
    cloze_distractors_id: ['boneka', 'lampu', 'peti'],
  },
  {
    learning_item_slug: 'boneka',
    recognition_distractors_nl: ['masker', 'beeld', 'pop van leer'],
    cued_recall_distractors_id: ['raksasa', 'kelir', 'peti'],
    cloze_distractors_id: ['raksasa', 'kelir', 'lampu'],
  },
  {
    learning_item_slug: 'dalang',
    recognition_distractors_nl: ['speler', 'toeschouwer', 'zanger'],
    cued_recall_distractors_id: ['pemain', 'penonton', 'penyanyi'],
    cloze_distractors_id: ['pemain', 'pesinden', 'pegawai'],
  },
  {
    learning_item_slug: 'gamelan',
    recognition_distractors_nl: ['lied', 'podium', 'Javaanse zangeres'],
    cued_recall_distractors_id: ['gamelan', 'lagu', 'panggung'].filter((w) => w !== 'gamelan'),
    cloze_distractors_id: ['lagu', 'panggung', 'kelir'],
  },
  {
    learning_item_slug: 'hutan',
    recognition_distractors_nl: ['berg', 'rivier', 'huid'],
    cued_recall_distractors_id: ['hitung', 'kulit', 'panggung'],
    cloze_distractors_id: ['panggung', 'peti', 'kelir'],
  },
  {
    learning_item_slug: 'kata',
    recognition_distractors_nl: ['lied', 'verhaal', 'zin'],
    cued_recall_distractors_id: ['lagu', 'kue', 'kulit'],
    cloze_distractors_id: ['lagu', 'kabar', 'cerita'].filter((w) => w === 'lagu'),
  },
  {
    learning_item_slug: 'kasihan',
    recognition_distractors_nl: ['lelijk', 'arm', 'verdrietig'],
    cued_recall_distractors_id: ['jelek', 'laris', 'siap'],
    cloze_distractors_id: ['jelek', 'laris', 'siap'],
  },
  {
    learning_item_slug: 'kelir',
    recognition_distractors_nl: ['podium', 'lamp', 'gordijn'],
    cued_recall_distractors_id: ['kulit', 'lampu', 'panggung'],
    cloze_distractors_id: ['panggung', 'lampu', 'alat'],
  },
  {
    learning_item_slug: 'ki',
    recognition_distractors_nl: ['meester', 'heer', 'wijze'],
    cued_recall_distractors_id: ['dalang', 'pegawai', 'raksasa'],
    cloze_distractors_id: ['dalang', 'pegawai', 'pemain'],
  },
  {
    learning_item_slug: 'kue',
    recognition_distractors_nl: ['brood', 'snack', 'thee'],
    cued_recall_distractors_id: ['kulit', 'kata', 'lagu'],
    cloze_distractors_id: ['kulit', 'alat', 'peti'],
  },
  {
    learning_item_slug: 'kulit',
    recognition_distractors_nl: ['vlees', 'bot', 'doek'],
    cued_recall_distractors_id: ['kue', 'kata', 'hutan'],
    cloze_distractors_id: ['alat', 'kue', 'peti'],
  },
  {
    learning_item_slug: 'lagu',
    recognition_distractors_nl: ['dans', 'Javaans orkest', 'woord'],
    cued_recall_distractors_id: ['lampu', 'kata', 'gamelan'],
    cloze_distractors_id: ['gamelan', 'kata', 'tari'].filter((w) => w !== 'tari'),
  },
  {
    learning_item_slug: 'lampu',
    recognition_distractors_nl: ['scherm', 'podium', 'lied'],
    cued_recall_distractors_id: ['lagu', 'kelir', 'alat'],
    cloze_distractors_id: ['kelir', 'alat', 'panggung'],
  },
  {
    learning_item_slug: 'panggung',
    recognition_distractors_nl: ['scherm', 'zaal', 'vertoning'],
    cued_recall_distractors_id: ['pertunjukan', 'kelir', 'lampu'],
    cloze_distractors_id: ['kelir', 'lampu', 'pertunjukan'],
  },
  {
    learning_item_slug: 'pegawai',
    recognition_distractors_nl: ['speler', 'toeschouwer', 'baas'],
    cued_recall_distractors_id: ['pemain', 'penonton', 'penyanyi'],
    cloze_distractors_id: ['pemain', 'penonton', 'dalang'],
  },
  {
    learning_item_slug: 'pemain',
    recognition_distractors_nl: ['toeschouwer', 'zanger', 'vertoner (van wayang)'],
    cued_recall_distractors_id: ['pemain', 'penonton', 'penyanyi'].filter((w) => w !== 'pemain'),
    cloze_distractors_id: ['penonton', 'dalang', 'penyanyi'],
  },
  {
    learning_item_slug: 'penonton',
    recognition_distractors_nl: ['speler', 'zanger', 'ambtenaar'],
    cued_recall_distractors_id: ['penyanyi', 'pemain', 'pesinden'],
    cloze_distractors_id: ['pemain', 'penyanyi', 'dalang'],
  },
  {
    learning_item_slug: 'penyanyi',
    recognition_distractors_nl: ['speler', 'toeschouwer', 'danser'],
    cued_recall_distractors_id: ['penonton', 'pemain', 'pesinden'],
    cloze_distractors_id: ['pesinden', 'pemain', 'penonton'],
  },
  {
    learning_item_slug: 'pertunjukan',
    recognition_distractors_nl: ['podium', 'lied', 'voorstelling van wayang'],
    cued_recall_distractors_id: ['panggung', 'penonton', 'pemain'],
    cloze_distractors_id: ['panggung', 'lagu', 'wayang'],
  },
  {
    learning_item_slug: 'pesinden',
    recognition_distractors_nl: ['toeschouwer', 'speler', 'danseres'],
    cued_recall_distractors_id: ['penyanyi', 'penonton', 'pemain'],
    cloze_distractors_id: ['penyanyi', 'pemain', 'penonton'],
  },
  {
    learning_item_slug: 'peti',
    recognition_distractors_nl: ['mand', 'doos', 'tas'],
    cued_recall_distractors_id: ['kue', 'alat', 'kulit'],
    cloze_distractors_id: ['alat', 'lampu', 'kelir'],
  },
  {
    learning_item_slug: 'raksasa',
    recognition_distractors_nl: ['held', 'koning', 'pop'],
    cued_recall_distractors_id: ['boneka', 'dalang', 'pemain'],
    cloze_distractors_id: ['boneka', 'pemain', 'dalang'],
  },
  {
    learning_item_slug: 'wayang',
    recognition_distractors_nl: ['dans', 'lied', 'orkest'],
    cued_recall_distractors_id: ['gamelan', 'panggung', 'pertunjukan'],
    cloze_distractors_id: ['gamelan', 'pertunjukan', 'tari'].filter((w) => w !== 'tari'),
  },

  // ── Verbs ──────────────────────────────────────────────────────────────
  {
    learning_item_slug: 'hitung',
    recognition_distractors_nl: ['optellen', 'meten', 'wegen'],
    cued_recall_distractors_id: ['hutan', 'potong', 'pasang'],
    cloze_distractors_id: ['tambah', 'tulis', 'pasang'],
  },
  {
    learning_item_slug: 'jadi',
    recognition_distractors_nl: ['blijven', 'maken', 'beginnen'],
    cued_recall_distractors_id: ['jual', 'jelek', 'main'].filter((w) => w !== 'jelek'),
    cloze_distractors_id: ['mulai', 'siap', 'main'].filter((w) => w !== 'siap'),
  },
  {
    learning_item_slug: 'lari',
    recognition_distractors_nl: ['springen', 'lopen', 'vallen'],
    cued_recall_distractors_id: ['laris', 'tari', 'main'],
    cloze_distractors_id: ['loncat', 'tendang', 'tari'],
  },
  {
    learning_item_slug: 'layang',
    recognition_distractors_nl: ['rennen', 'springen', 'vallen'],
    cued_recall_distractors_id: ['lari', 'layang', 'main'].filter((w) => w !== 'layang'),
    cloze_distractors_id: ['lari', 'loncat', 'tari'],
  },
  {
    learning_item_slug: 'main',
    recognition_distractors_nl: ['dansen', 'zingen', 'rennen'],
    cued_recall_distractors_id: ['lari', 'tari', 'menang'],
    cloze_distractors_id: ['tari', 'nyanyi', 'menang'],
  },
  {
    learning_item_slug: 'menang',
    recognition_distractors_nl: ['verliezen', 'vechten', 'spelen'],
    cued_recall_distractors_id: ['main', 'perang', 'pasang'],
    cloze_distractors_id: ['perang', 'main', 'tendang'],
  },
  {
    learning_item_slug: 'nyanyi',
    recognition_distractors_nl: ['dansen', 'spelen', 'lachen'],
    cued_recall_distractors_id: ['tari', 'main', 'lari'],
    cloze_distractors_id: ['tari', 'main', 'tertawa'],
  },
  {
    learning_item_slug: 'pasang',
    recognition_distractors_nl: ['snijden', 'verlengen', 'verwisselen'],
    cued_recall_distractors_id: ['potong', 'sambung', 'perang'],
    cloze_distractors_id: ['sambung', 'potong', 'ganti'],
  },
  {
    learning_item_slug: 'perang',
    recognition_distractors_nl: ['winnen', 'schoppen', 'vechten tegen'],
    cued_recall_distractors_id: ['pasang', 'menang', 'potong'],
    cloze_distractors_id: ['menang', 'tendang', 'main'],
  },
  {
    learning_item_slug: 'potong',
    recognition_distractors_nl: ['snijden met mes', 'breken', 'graveren'],
    cued_recall_distractors_id: ['pasang', 'tonton', 'sambung'],
    cloze_distractors_id: ['sambung', 'ukir', 'pasang'],
  },
  {
    learning_item_slug: 'sambung',
    recognition_distractors_nl: ['snijden', 'aansluiten', 'herhalen'],
    cued_recall_distractors_id: ['pasang', 'potong', 'tambah'],
    cloze_distractors_id: ['pasang', 'tambah', 'ulang'],
  },
  {
    learning_item_slug: 'tari',
    recognition_distractors_nl: ['zingen', 'spelen', 'rennen'],
    cued_recall_distractors_id: ['lari', 'main', 'nyanyi'],
    cloze_distractors_id: ['nyanyi', 'main', 'lari'],
  },
  {
    learning_item_slug: 'tendang',
    recognition_distractors_nl: ['slaan', 'rennen', 'springen'],
    cued_recall_distractors_id: ['tonton', 'tari', 'potong'],
    cloze_distractors_id: ['perang', 'lari', 'loncat'],
  },
  {
    learning_item_slug: 'tertawa',
    recognition_distractors_nl: ['huilen', 'zingen', 'praten'],
    cued_recall_distractors_id: ['tari', 'tonton', 'tendang'],
    cloze_distractors_id: ['nyanyi', 'main', 'menang'],
  },
  {
    learning_item_slug: 'tonton',
    recognition_distractors_nl: ['kijken (algemeen)', 'luisteren', 'wachten'],
    cued_recall_distractors_id: ['tendang', 'tari', 'tunggu'],
    cloze_distractors_id: ['tunggu', 'tari', 'main'],
  },

  // ── Adjectives ─────────────────────────────────────────────────────────
  {
    learning_item_slug: 'jelek',
    recognition_distractors_nl: ['mooi', 'zielig', 'gewild'],
    cued_recall_distractors_id: ['jadi', 'laris', 'siap'].filter((w) => w !== 'jadi'),
    cloze_distractors_id: ['laris', 'kasihan', 'siap'],
  },
  {
    learning_item_slug: 'laris',
    recognition_distractors_nl: ['lelijk', 'duur', 'klaar'],
    cued_recall_distractors_id: ['lari', 'jelek', 'siap'].filter((w) => w !== 'lari') ?? [],
    cloze_distractors_id: ['jelek', 'siap', 'kasihan'],
  },
  {
    learning_item_slug: 'siap',
    recognition_distractors_nl: ['lelijk', 'zielig', 'gewild'],
    cued_recall_distractors_id: ['jelek', 'laris', 'kasihan'],
    cloze_distractors_id: ['jelek', 'laris', 'kasihan'],
  },

  // ── Particles ──────────────────────────────────────────────────────────
  {
    learning_item_slug: 'para',
    recognition_distractors_nl: ['net als', 'gedurende', 'klanknabootsend woord'],
    cued_recall_distractors_id: ['plak-plek', 'selama', 'seolah-olah'],
    cloze_distractors_id: ['plak-plek', 'selama', 'seolah-olah'],
  },
  {
    learning_item_slug: 'plak-plek',
    recognition_distractors_nl: ['de (meervoud)', 'net als', 'gedurende'],
    cued_recall_distractors_id: ['para', 'seolah-olah', 'selama'],
    cloze_distractors_id: ['para', 'seolah-olah', 'selama'],
  },

  // ── Preposition ────────────────────────────────────────────────────────
  {
    learning_item_slug: 'selama',
    recognition_distractors_nl: ['net als', 'sinds', 'tot'],
    cued_recall_distractors_id: ['seolah-olah', 'para', 'plak-plek'],
    cloze_distractors_id: ['seolah-olah', 'para', 'plak-plek'],
  },

  // ── Adverb ─────────────────────────────────────────────────────────────
  {
    learning_item_slug: 'seolah-olah',
    recognition_distractors_nl: ['gedurende', 'de (meervoud)', 'eindelijk'],
    cued_recall_distractors_id: ['selama', 'para', 'plak-plek'],
    cloze_distractors_id: ['selama', 'para', 'plak-plek'],
  },
]
