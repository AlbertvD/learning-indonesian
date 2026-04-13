// Cloze contexts for Lesson 1 — Di Pasar (Op de markt)
// One cloze context minimum per vocabulary/expressions/numbers item
// learning_item_slug matches base_text from learning-items.ts (lowercase, trimmed)
// source_text contains exactly one ___ replacing the target word/phrase

export interface ClozeContext {
  learning_item_slug: string
  source_text: string
  translation_text: string
  difficulty: 'A1' | 'A2' | 'B1' | 'B2' | null
  topic_tag: string | null
}

export const clozeContexts: ClozeContext[] = [

  // ── WOORDENLIJST (44 items) ─────────────────────────────────────────────

  // akhir — einde
  {
    learning_item_slug: 'akhir',
    source_text: 'Di ___ minggu ini ada pasar besar.',
    translation_text: 'Aan het einde van deze week is er een grote markt.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'akhir',
    source_text: 'Ini ___ dari cerita.',
    translation_text: 'Dit is het einde van het verhaal.',
    difficulty: 'A1',
    topic_tag: 'daily_life',
  },

  // apa? — wat?
  {
    learning_item_slug: 'apa',
    source_text: '___ kabar?',
    translation_text: 'Hoe gaat het ermee?',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },
  {
    learning_item_slug: 'apa',
    source_text: 'Bapak mau beli ___ hari ini?',
    translation_text: 'Wat wil meneer vandaag kopen?',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // bahasa — taal
  {
    learning_item_slug: 'bahasa',
    source_text: 'Saya mau belajar ___ Indonesia.',
    translation_text: 'Ik wil de Indonesische taal leren.',
    difficulty: 'A1',
    topic_tag: 'language',
  },
  {
    learning_item_slug: 'bahasa',
    source_text: 'Lima ___ tidak cukup.',
    translation_text: 'Vijf talen zijn niet genoeg.',
    difficulty: 'A1',
    topic_tag: 'language',
  },

  // baik — goed
  {
    learning_item_slug: 'baik',
    source_text: 'Apa kabar? ___, terima kasih.',
    translation_text: 'Hoe gaat het ermee? Goed, dank u wel.',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },
  {
    learning_item_slug: 'baik',
    source_text: 'Harga pisang di pasar ini sangat ___.',
    translation_text: 'De prijs van bananen op deze markt is erg goed.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // bapak — meneer, vader, u
  {
    learning_item_slug: 'bapak',
    source_text: '___ dan Ibu beli nanas.',
    translation_text: 'Meneer en mevrouw kopen ananas.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'bapak',
    source_text: '___ makan buah.',
    translation_text: 'Meneer eet een vrucht.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // beli — kopen
  {
    learning_item_slug: 'beli',
    source_text: 'Saya ___ buah.',
    translation_text: 'Ik koop een vrucht.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'beli',
    source_text: 'Ibu ___ enam pisang.',
    translation_text: 'Mevrouw koopt zes bananen.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // belum — nog niet
  {
    learning_item_slug: 'belum',
    source_text: '___ bisa Bu. Tetapi kalau mau lima buah, bisa sembilan rupiah.',
    translation_text: 'Dat kan nog niet, mevrouw. Maar als u vijf vruchten wilt, kan het voor negen rupiah.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'belum',
    source_text: 'Saya ___ mau ke pasar hari ini.',
    translation_text: 'Ik wil nog niet naar de markt vandaag.',
    difficulty: 'A1',
    topic_tag: 'daily_life',
  },

  // berapa? — hoeveel?
  {
    learning_item_slug: 'berapa',
    source_text: 'Pak, saya mau beli tiga buah pisang. ___ harganya?',
    translation_text: 'Meneer, ik wil drie bananen kopen. Hoeveel kost het?',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'berapa',
    source_text: 'Bapak mau ___ buah? Tiga.',
    translation_text: 'Hoeveel vruchten wilt u, meneer? Drie.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // besar — groot
  {
    learning_item_slug: 'besar',
    source_text: 'Saya mau beli rumah ___.',
    translation_text: 'Ik wil een groot huis kopen.',
    difficulty: 'A1',
    topic_tag: 'daily_life',
  },
  {
    learning_item_slug: 'besar',
    source_text: 'Pasar di Bali sangat ___.',
    translation_text: 'De markt in Bali is erg groot.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // bisa — kunnen, mogen
  {
    learning_item_slug: 'bisa',
    source_text: 'Belum ___ Bu. Tetapi kalau mau lima buah, bisa sembilan rupiah.',
    translation_text: 'Dat kan nog niet, mevrouw. Maar als u vijf vruchten wilt, kan het voor negen rupiah.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'bisa',
    source_text: 'Kalau mau lima buah, ___ sembilan rupiah.',
    translation_text: 'Als u vijf vruchten wilt, kan het voor negen rupiah.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // boleh — mogen, kunnen
  {
    learning_item_slug: 'boleh',
    source_text: 'Itu mahal ya! Empat rupiah ___?',
    translation_text: 'Dat is duur! Mag het voor vier rupiah?',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'boleh',
    source_text: '___ saya makan pisang ini?',
    translation_text: 'Mag ik deze banaan eten?',
    difficulty: 'A1',
    topic_tag: 'daily_life',
  },

  // buah — vrucht
  {
    learning_item_slug: 'buah',
    source_text: 'Saya beli ___.',
    translation_text: 'Ik koop een vrucht.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'buah',
    source_text: 'Sembilan ___ mahal, saya mau enam.',
    translation_text: 'Negen vruchten zijn duur, ik wil zes.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // cukup — voldoende
  {
    learning_item_slug: 'cukup',
    source_text: 'Tujuh nanas tidak ___.',
    translation_text: 'Zeven ananassen is niet genoeg.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'cukup',
    source_text: 'Enam pisang ___ untuk saya.',
    translation_text: 'Zes bananen zijn genoeg voor mij.',
    difficulty: 'A1',
    topic_tag: 'daily_life',
  },

  // dan — en
  {
    learning_item_slug: 'dan',
    source_text: 'Bapak ___ Ibu beli nanas.',
    translation_text: 'Meneer en mevrouw kopen ananas.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'dan',
    source_text: 'Ibu beli nanas ___ pisang.',
    translation_text: 'Mevrouw koopt ananas en bananen.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // dari — uit, van
  {
    learning_item_slug: 'dari',
    source_text: 'Ibu datang ___ pasar.',
    translation_text: 'Mevrouw komt van de markt.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'dari',
    source_text: 'Ibu Gusti Ayu datang ___ Bali.',
    translation_text: 'Mevrouw Gusti Ayu komt uit Bali.',
    difficulty: 'A1',
    topic_tag: 'travel',
  },

  // datang — komen
  {
    learning_item_slug: 'datang',
    source_text: 'Ibu ___ dari pasar.',
    translation_text: 'Mevrouw komt van de markt.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'datang',
    source_text: 'Selamat ___, Bu, apa kabar?',
    translation_text: 'Welkom, mevrouw, hoe gaat het ermee?',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },

  // di — in, op, te
  {
    learning_item_slug: 'di',
    source_text: 'Saya beli pisang ___ pasar.',
    translation_text: 'Ik koop bananen op de markt.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'di',
    source_text: '___ toko pisang mahal.',
    translation_text: 'In de winkel zijn bananen duur.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // harga — prijs
  {
    learning_item_slug: 'harga',
    source_text: 'Berapa ___nya?',
    translation_text: 'Wat kost het?',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'harga',
    source_text: '___ pisang murah.',
    translation_text: 'De prijs van bananen is laag.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // hotel — hotel
  {
    learning_item_slug: 'hotel',
    source_text: 'Bapak dan Ibu mau ke ___.',
    translation_text: 'Meneer en mevrouw willen naar het hotel.',
    difficulty: 'A1',
    topic_tag: 'travel',
  },
  {
    learning_item_slug: 'hotel',
    source_text: 'Saya mau ke ___ besar di Jakarta.',
    translation_text: 'Ik wil naar het grote hotel in Jakarta.',
    difficulty: 'A1',
    topic_tag: 'travel',
  },

  // ibu — mevrouw, moeder, u
  {
    learning_item_slug: 'ibu',
    source_text: '___ mau ke pasar.',
    translation_text: 'Mevrouw wil naar de markt.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'ibu',
    source_text: 'Dua ___ beli sembilan buah.',
    translation_text: 'Twee dames kopen negen vruchten.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // Indonesia — Indonesie
  {
    learning_item_slug: 'indonesia',
    source_text: 'Saya mau belajar bahasa ___.',
    translation_text: 'Ik wil Indonesisch leren.',
    difficulty: 'A1',
    topic_tag: 'language',
  },
  {
    learning_item_slug: 'indonesia',
    source_text: 'Rupiah adalah mata uang ___.',
    translation_text: 'De rupiah is de munteenheid van Indonesie.',
    difficulty: 'A1',
    topic_tag: 'culture',
  },

  // itu — dat, die
  {
    learning_item_slug: 'itu',
    source_text: '___ mahal ya! Empat rupiah boleh?',
    translation_text: 'Dat is duur! Mag het voor vier rupiah?',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'itu',
    source_text: 'Rumah ___ besar.',
    translation_text: 'Dat huis is groot.',
    difficulty: 'A1',
    topic_tag: 'daily_life',
  },

  // kabar — bericht
  {
    learning_item_slug: 'kabar',
    source_text: 'Apa ___?',
    translation_text: 'Hoe gaat het ermee?',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },
  {
    learning_item_slug: 'kabar',
    source_text: 'Baik, terima kasih. ___ Bapak?',
    translation_text: 'Goed, dank u wel. Hoe gaat het met meneer?',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },

  // kalau — indien, wanneer
  {
    learning_item_slug: 'kalau',
    source_text: '___ mau lima buah, bisa sembilan rupiah.',
    translation_text: 'Als u vijf vruchten wilt, kan het voor negen rupiah.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'kalau',
    source_text: '___ mau ke pasar, beli pisang juga.',
    translation_text: 'Als je naar de markt gaat, koop dan ook bananen.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // kasih — gunst, genegenheid
  {
    learning_item_slug: 'kasih',
    source_text: 'Terima ___, Bu.',
    translation_text: 'Dank u wel, mevrouw.',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },
  {
    learning_item_slug: 'kasih',
    source_text: 'Baik, terima ___.',
    translation_text: 'Goed, dank u wel.',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },

  // ke — naar
  {
    learning_item_slug: 'ke',
    source_text: 'Saya ___ pasar.',
    translation_text: 'Ik ga naar de markt.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'ke',
    source_text: 'Bapak tidak mau ___ pasar, tetapi mau ke hotel.',
    translation_text: 'Meneer wil niet naar de markt, maar naar het hotel.',
    difficulty: 'A1',
    topic_tag: 'travel',
  },

  // kosong — leeg
  {
    learning_item_slug: 'kosong',
    source_text: 'Nol disebut juga ___.',
    translation_text: 'Nul heet ook kosong (leeg).',
    difficulty: 'A1',
    topic_tag: 'numbers',
  },
  {
    learning_item_slug: 'kosong',
    source_text: 'Keranjang saya ___ sekarang.',
    translation_text: 'Mijn mand is nu leeg.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // mahal — duur
  {
    learning_item_slug: 'mahal',
    source_text: 'Itu ___ ya! Empat rupiah boleh?',
    translation_text: 'Dat is duur! Mag het voor vier rupiah?',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'mahal',
    source_text: 'Harga nanas ___.',
    translation_text: 'De prijs van ananas is duur.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // makan — eten
  {
    learning_item_slug: 'makan',
    source_text: 'Bapak ___ buah.',
    translation_text: 'Meneer eet een vrucht.',
    difficulty: 'A1',
    topic_tag: 'food',
  },
  {
    learning_item_slug: 'makan',
    source_text: 'Saya tidak mau ___ pisang.',
    translation_text: 'Ik wil geen bananen eten.',
    difficulty: 'A1',
    topic_tag: 'food',
  },

  // mau — willen
  {
    learning_item_slug: 'mau',
    source_text: 'Ibu ___ ke pasar.',
    translation_text: 'Mevrouw wil naar de markt.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'mau',
    source_text: 'Saya tidak ___ pisang.',
    translation_text: 'Ik wil geen bananen.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // murah — goedkoop
  {
    learning_item_slug: 'murah',
    source_text: 'Harganya ___ Bu, delapan rupiah.',
    translation_text: 'Het is goedkoop, mevrouw, acht rupiah.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'murah',
    source_text: 'Di pasar pisang ___.',
    translation_text: 'Op de markt zijn bananen goedkoop.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // nanas — ananas
  {
    learning_item_slug: 'nanas',
    source_text: 'Bapak dan Ibu beli ___.',
    translation_text: 'Meneer en mevrouw kopen ananas.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'nanas',
    source_text: 'Harga ___ mahal.',
    translation_text: 'De prijs van ananas is duur.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // nyonya — mevrouw, u
  {
    learning_item_slug: 'nyonya',
    source_text: '___ mau beli berapa nanas?',
    translation_text: 'Hoeveel ananassen wil mevrouw kopen?',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'nyonya',
    source_text: 'Selamat datang, ___.',
    translation_text: 'Welkom, mevrouw.',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },

  // orang — mens
  {
    learning_item_slug: 'orang',
    source_text: 'Dua ___ beli sembilan nanas.',
    translation_text: 'Twee mensen kopen negen ananassen.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'orang',
    source_text: 'Di pasar ada banyak ___.',
    translation_text: 'Op de markt zijn veel mensen.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // pasar — markt
  {
    learning_item_slug: 'pasar',
    source_text: 'Saya ke ___.',
    translation_text: 'Ik ga naar de markt.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'pasar',
    source_text: 'Di ___ pisang murah.',
    translation_text: 'Op de markt zijn bananen goedkoop.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // penjual — verkoper
  {
    learning_item_slug: 'penjual',
    source_text: 'Empat ___ ada di pasar.',
    translation_text: 'Er zijn vier verkopers op de markt.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'penjual',
    source_text: '___ itu mau beli pisang dan nanas.',
    translation_text: 'Die verkoper wil bananen en ananas kopen.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // pisang — banaan
  {
    learning_item_slug: 'pisang',
    source_text: 'Pak, saya mau beli tiga buah ___.',
    translation_text: 'Meneer, ik wil drie bananen kopen.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'pisang',
    source_text: 'Ibu beli enam ___.',
    translation_text: 'Mevrouw koopt zes bananen.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // rumah — huis
  {
    learning_item_slug: 'rumah',
    source_text: 'Saya mau beli ___ besar.',
    translation_text: 'Ik wil een groot huis kopen.',
    difficulty: 'A1',
    topic_tag: 'daily_life',
  },
  {
    learning_item_slug: 'rumah',
    source_text: '___ itu mahal.',
    translation_text: 'Dat huis is duur.',
    difficulty: 'A1',
    topic_tag: 'daily_life',
  },

  // rupiah — munteenheid
  {
    learning_item_slug: 'rupiah',
    source_text: 'Harganya murah Bu, delapan ___.',
    translation_text: 'Het is goedkoop, mevrouw, acht rupiah.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'rupiah',
    source_text: 'Empat ___ boleh?',
    translation_text: 'Mag het voor vier rupiah?',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // saya — ik, mijn
  {
    learning_item_slug: 'saya',
    source_text: '___ ke pasar.',
    translation_text: 'Ik ga naar de markt.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'saya',
    source_text: '___ tidak mau pisang, tetapi mau nanas.',
    translation_text: 'Ik wil geen bananen, maar wel ananas.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // selamat — veilig, welzijn
  {
    learning_item_slug: 'selamat',
    source_text: '___ datang, Bu, apa kabar?',
    translation_text: 'Welkom, mevrouw, hoe gaat het ermee?',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },
  {
    learning_item_slug: 'selamat',
    source_text: '___ pagi, Bapak!',
    translation_text: 'Goedemorgen, meneer!',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },

  // terima — ontvangen
  {
    learning_item_slug: 'terima',
    source_text: '___ kasih, Bu.',
    translation_text: 'Dank u wel, mevrouw.',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },
  {
    learning_item_slug: 'terima',
    source_text: 'Baik, ___ kasih.',
    translation_text: 'Goed, dank u wel.',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },

  // tetapi — maar, echter
  {
    learning_item_slug: 'tetapi',
    source_text: 'Belum bisa Bu. ___ kalau mau lima buah, bisa sembilan rupiah.',
    translation_text: 'Dat kan nog niet, mevrouw. Maar als u vijf vruchten wilt, kan het voor negen rupiah.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'tetapi',
    source_text: 'Bapak tidak mau ke pasar, ___ mau ke hotel.',
    translation_text: 'Meneer wil niet naar de markt, maar naar het hotel.',
    difficulty: 'A1',
    topic_tag: 'travel',
  },

  // tidak — niet, nee
  {
    learning_item_slug: 'tidak',
    source_text: 'Saya ___ mau pisang, saya mau nanas.',
    translation_text: 'Ik wil geen bananen, ik wil ananas.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'tidak',
    source_text: 'Tujuh nanas ___ cukup.',
    translation_text: 'Zeven ananassen is niet genoeg.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // ── UITDRUKKINGEN (6 phrases) ───────────────────────────────────────────

  // apa kabar?
  {
    learning_item_slug: 'apa kabar',
    source_text: 'Selamat datang Bu, ___?',
    translation_text: 'Welkom mevrouw, hoe gaat het ermee?',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },
  {
    learning_item_slug: 'apa kabar',
    source_text: '___? Baik, terima kasih.',
    translation_text: 'Hoe gaat het ermee? Goed, dank u wel.',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },

  // baik-baik saja
  {
    learning_item_slug: 'baik-baik saja',
    source_text: 'Apa kabar? ___.',
    translation_text: 'Hoe gaat het ermee? Goed, dank u wel.',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },
  {
    learning_item_slug: 'baik-baik saja',
    source_text: 'Saya ___, terima kasih, Pak.',
    translation_text: 'Het gaat goed met mij, dank u wel, meneer.',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },

  // berapa harganya?
  {
    learning_item_slug: 'berapa harganya',
    source_text: 'Pak, saya mau beli tiga buah pisang. ___',
    translation_text: 'Meneer, ik wil drie bananen kopen. Wat kost het?',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'berapa harganya',
    source_text: 'Nanas ini besar. ___',
    translation_text: 'Deze ananas is groot. Wat kost het?',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // harganya murah
  {
    learning_item_slug: 'harganya murah',
    source_text: '___, Bu, delapan rupiah saja.',
    translation_text: 'Het is goedkoop, mevrouw, maar acht rupiah.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'harganya murah',
    source_text: 'Di pasar ___, di toko mahal.',
    translation_text: 'Op de markt is het goedkoop, in de winkel is het duur.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // selamat datang
  {
    learning_item_slug: 'selamat datang',
    source_text: '___, Bu, apa kabar?',
    translation_text: 'Welkom, mevrouw, hoe gaat het ermee?',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },
  {
    learning_item_slug: 'selamat datang',
    source_text: '___ di pasar, Pak!',
    translation_text: 'Welkom op de markt, meneer!',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },

  // terima kasih
  {
    learning_item_slug: 'terima kasih',
    source_text: 'Apa kabar? Baik, ___.',
    translation_text: 'Hoe gaat het ermee? Goed, dank u wel.',
    difficulty: 'A1',
    topic_tag: 'greetings',
  },
  {
    learning_item_slug: 'terima kasih',
    source_text: '___, Pak. Harganya murah.',
    translation_text: 'Dank u wel, meneer. Het is goedkoop.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // ── TELWOORDEN (11 numbers) ─────────────────────────────────────────────

  // nol — 0
  {
    learning_item_slug: 'nol',
    source_text: 'Berapa buah pisang? ___.',
    translation_text: 'Hoeveel bananen? Nul.',
    difficulty: 'A1',
    topic_tag: 'numbers',
  },
  {
    learning_item_slug: 'nol',
    source_text: 'Harga pisang ini ___ rupiah.',
    translation_text: 'De prijs van deze banaan is nul rupiah.',
    difficulty: 'A1',
    topic_tag: 'numbers',
  },

  // satu — 1
  {
    learning_item_slug: 'satu',
    source_text: 'Saya mau beli ___ buah pisang.',
    translation_text: 'Ik wil een banaan kopen.',
    difficulty: 'A1',
    topic_tag: 'numbers',
  },
  {
    learning_item_slug: 'satu',
    source_text: 'Ada ___ penjual di sini.',
    translation_text: 'Er is een verkoper hier.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // dua — 2
  {
    learning_item_slug: 'dua',
    source_text: '___ ibu beli sembilan buah.',
    translation_text: 'Twee dames kopen negen vruchten.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'dua',
    source_text: 'Saya mau ___ pisang.',
    translation_text: 'Ik wil twee bananen.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // tiga — 3
  {
    learning_item_slug: 'tiga',
    source_text: 'Pak, saya mau beli ___ buah pisang.',
    translation_text: 'Meneer, ik wil drie bananen kopen.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'tiga',
    source_text: 'Bapak mau berapa buah? ___.',
    translation_text: 'Hoeveel vruchten wilt u, meneer? Drie.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // empat — 4
  {
    learning_item_slug: 'empat',
    source_text: 'Itu mahal ya! ___ rupiah boleh?',
    translation_text: 'Dat is duur! Mag het voor vier rupiah?',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'empat',
    source_text: '___ penjual di pasar.',
    translation_text: 'Vier verkopers op de markt.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // lima — 5
  {
    learning_item_slug: 'lima',
    source_text: 'Kalau mau ___ buah, bisa sembilan rupiah.',
    translation_text: 'Als u vijf vruchten wilt, kan het voor negen rupiah.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'lima',
    source_text: '___ bahasa tidak cukup.',
    translation_text: 'Vijf talen zijn niet genoeg.',
    difficulty: 'A1',
    topic_tag: 'language',
  },

  // enam — 6
  {
    learning_item_slug: 'enam',
    source_text: 'Ibu beli ___ pisang.',
    translation_text: 'Mevrouw koopt zes bananen.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'enam',
    source_text: 'Saya mau ___ buah.',
    translation_text: 'Ik wil zes vruchten.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // tujuh — 7
  {
    learning_item_slug: 'tujuh',
    source_text: '___ nanas tidak cukup.',
    translation_text: 'Zeven ananassen is niet genoeg.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'tujuh',
    source_text: 'Bapak mau ___ buah.',
    translation_text: 'Meneer wil zeven vruchten.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // delapan — 8
  {
    learning_item_slug: 'delapan',
    source_text: 'Harganya murah Bu, ___ rupiah.',
    translation_text: 'Het is goedkoop, mevrouw, acht rupiah.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'delapan',
    source_text: 'Saya mau beli ___.',
    translation_text: 'Ik wil er acht kopen.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // sembilan — 9
  {
    learning_item_slug: 'sembilan',
    source_text: 'Kalau mau lima buah, bisa ___ rupiah.',
    translation_text: 'Als u vijf vruchten wilt, kan het voor negen rupiah.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'sembilan',
    source_text: 'Dua ibu beli ___ buah.',
    translation_text: 'Twee dames kopen negen vruchten.',
    difficulty: 'A1',
    topic_tag: 'market',
  },

  // sepuluh — 10
  {
    learning_item_slug: 'sepuluh',
    source_text: 'Ada ___ orang di pasar.',
    translation_text: 'Er zijn tien mensen op de markt.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
  {
    learning_item_slug: 'sepuluh',
    source_text: '___ rupiah terlalu mahal.',
    translation_text: 'Tien rupiah is te duur.',
    difficulty: 'A1',
    topic_tag: 'market',
  },
]
