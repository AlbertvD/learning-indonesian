export interface LessonData {
  module_id: string
  level: string
  title: string
  description: string
  order_index: number
  sections: Array<{
    title: string
    content: Record<string, unknown>
    order_index: number
  }>
}

export const lessons: LessonData[] = [
  {
    module_id: 'module-1',
    level: 'A1',
    title: 'Les 1 - Di Pasar (Op de markt)',
    description: 'Learn basic Indonesian greetings, fruits vocabulary, and shopping phrases at the market.',
    order_index: 1,
    sections: [
      {
        title: 'Vertaal naar het Indonesisch (Translate to Indonesian)',
        content: {
          type: 'exercises',
          items: [
            { dutch: 'Ik ga naar de markt', indonesian: 'Saya ke pasar' },
            { dutch: 'Mevrouw koopt zes bananen', indonesian: 'Ibu beli enam pisang' },
            { dutch: 'Wat kost het?', indonesian: 'Berapa harganya?' },
            { dutch: 'Welkom mevrouw hoe is het met u?', indonesian: 'Selamat datang Bu apa kabar?' },
            { dutch: 'Ik wil geen bananen ik wil ananas', indonesian: 'Saya tidak mau pisang saya mau nanas' },
            { dutch: 'Meneer eet een vrucht', indonesian: 'Bapak makan buah' },
            { dutch: 'Mevrouw Gusti Ayu en moeder komen uit Bali', indonesian: 'Ibu Gusti Ayu dan ibu datang dari Bali' },
            { dutch: 'In de winkel zijn bananen duur op de markt zijn ze goedkoop', indonesian: 'Di toko pisang mahal di pasar murah' },
            { dutch: 'Hoe gaat het ermee? Goed dank u wel', indonesian: 'Apa kabar? Baik terima kasih' },
            { dutch: 'Twee dames kopen negen vruchten', indonesian: 'Dua ibu beli sembilan buah' },
          ],
        },
        order_index: 0,
      },
      {
        title: 'Vertaal naar het Nederlands (Translate to Dutch)',
        content: {
          type: 'exercises',
          items: [
            { indonesian: 'Saya tidak mau makan pisang', dutch: 'Ik wil geen bananen eten' },
            { indonesian: 'Selamat datang Bu apa kabar?', dutch: 'Welkom mevrouw hoe gaat het ermee?' },
            { indonesian: 'Baik terima kasih', dutch: 'Goed dank u wel' },
            { indonesian: 'Harga pisang murah harga nanas mahal', dutch: 'De prijs van bananen is goedkoop de prijs van ananas is duur' },
            { indonesian: 'Bapak dan Ibu tidak mau ke pasar tetapi mau ke hotel', dutch: 'Meneer en mevrouw willen niet naar de markt maar naar het hotel' },
            { indonesian: 'Bapak mau berapa buah? Tiga', dutch: 'Hoeveel vruchten wilt u meneer? Drie' },
            { indonesian: 'Tujuh nanas tidak cukup', dutch: 'Zeven ananassen is niet genoeg' },
            { indonesian: 'Saya mau beli delapan', dutch: 'Ik wil acht kopen' },
            { indonesian: 'Ibu datang dari pasar dan beli nanas dan pisang', dutch: 'Mevrouw komt van de markt en koopt ananas en bananen' },
            { indonesian: 'Sembilan buah mahal saya mau enam buah', dutch: 'Negen vruchten zijn duur ik wil zes vruchten' },
          ],
        },
        order_index: 1,
      },
      {
        title: 'Schrijf de getallen (Write the numbers)',
        content: {
          type: 'exercises',
          items: [
            { dutch: '2 bananen', indonesian: 'dua pisang' },
            { dutch: '9 heren', indonesian: 'sembilan bapak' },
            { dutch: '7 ananassen', indonesian: 'tujuh nanas' },
            { dutch: '6 dames', indonesian: 'enam ibu' },
            { dutch: '4 verkopers', indonesian: 'empat penjual' },
            { dutch: '3 winkels', indonesian: 'tiga toko' },
          ],
        },
        order_index: 2,
      },
    ],
  },
  {
    module_id: 'module-1',
    level: 'A1',
    title: 'Les 2 - Di Indonesia (In Indonesië)',
    description: 'Learn the SE- prefix, ini/itu (this/that), negation with tidak, and adjectives.',
    order_index: 2,
    sections: [
      {
        title: 'Vertaal naar het Indonesisch (Translate to Indonesian)',
        content: {
          type: 'exercises',
          items: [
            { dutch: 'Dit is meneer Jansen', indonesian: 'Ini Bapak Jansen' },
            { dutch: 'Dat is een banaan', indonesian: 'Itu pisang' },
            { dutch: 'Dit is een winkel', indonesian: 'Ini toko' },
            { dutch: 'Dat is een taxi', indonesian: 'Itu taksi' },
            { dutch: 'Dit is mevrouw De Wit', indonesian: 'Ini Ibu De Wit' },
            { dutch: 'Deze deur is zwaar', indonesian: 'Pintu ini berat' },
            { dutch: 'Dit huis is nieuw', indonesian: 'Rumah ini baru' },
            { dutch: 'Deze vrucht is zoet', indonesian: 'Buah ini manis' },
            { dutch: 'Deze kamer is vol', indonesian: 'Kamar ini penuh' },
            { dutch: 'Dat hotel is duur', indonesian: 'Hotel itu mahal' },
          ],
        },
        order_index: 0,
      },
      {
        title: 'Vertaal naar het Nederlands (Translate to Dutch)',
        content: {
          type: 'exercises',
          items: [
            { indonesian: 'Itu kabar baik', dutch: 'Dat is goed nieuws' },
            { indonesian: 'Ini istri saya', dutch: 'Dit is mijn vrouw' },
            { indonesian: 'Selamat datang di Indonesia', dutch: 'Welkom in Indonesië' },
            { indonesian: 'Sudah dapat taksi?', dutch: 'Heb je al een taxi?' },
            { indonesian: 'Saya dan istri saya menginap di hotel', dutch: 'Ik en mijn vrouw overnachten in het hotel' },
            { indonesian: 'Bapak menginap di mana?', dutch: 'Waar overnacht u meneer?' },
            { indonesian: 'Saya menginap di Hotel Rama', dutch: 'Ik overnacht in Hotel Rama' },
            { indonesian: 'Saya tidak mau menginap', dutch: 'Ik wil niet overnachten' },
            { indonesian: 'Pasar murah di mana?', dutch: 'Waar is de goedkope markt?' },
            { indonesian: 'Hasan tidak pulang ke Jakarta', dutch: 'Hasan gaat niet terug naar Jakarta' },
            { indonesian: 'Di sana ada rumah lama', dutch: 'Daar is een oud huis' },
            { indonesian: 'Ada berapa taksi?', dutch: "Hoeveel taxi's zijn er?" },
            { indonesian: 'Di sana ada sebelas taksi', dutch: "Daar zijn elf taxi's" },
          ],
        },
        order_index: 1,
      },
      {
        title: 'Schrijf de berekeningen (Write the calculations)',
        content: {
          type: 'exercises',
          items: [
            { dutch: '1+4=?', indonesian: 'satu tambah empat sama dengan lima' },
            { dutch: '3+6=?', indonesian: 'tiga tambah enam sama dengan sembilan' },
            { dutch: '5+3=?', indonesian: 'lima tambah tiga sama dengan delapan' },
            { dutch: '7+3=?', indonesian: 'tujuh tambah tiga sama dengan sepuluh' },
            { dutch: '4+2=?', indonesian: 'empat tambah dua sama dengan enam' },
            { dutch: '9+1=?', indonesian: 'sembilan tambah satu sama dengan sepuluh' },
            { dutch: '1+7=?', indonesian: 'satu tambah tujuh sama dengan delapan' },
          ],
        },
        order_index: 2,
      },
    ],
  },
  {
    module_id: 'module-1',
    level: 'A1',
    title: 'Les 3 - Di Bandar Udara (Op het vliegveld)',
    description: 'Learn ada (there is/are), question words, sekali (very), and place words (dari, di, ke).',
    order_index: 3,
    sections: [
      {
        title: 'Vertaal naar het Indonesisch (Translate to Indonesian)',
        content: {
          type: 'exercises',
          items: [
            { dutch: 'Ik ga naar Indonesië', indonesian: 'Saya ke Indonesia' },
            { dutch: 'Moeder wil boeken kopen in Amsterdam', indonesian: 'Ibu mau beli buku di Amsterdam' },
            { dutch: 'Kartono is op het vliegveld', indonesian: 'Kartono di bandar udara' },
            { dutch: 'Vader is op kantoor', indonesian: 'Bapak di kantor' },
            { dutch: 'Ik woon in de stad Utrecht', indonesian: 'Saya tinggal di kota Utrecht' },
            { dutch: 'Tono komt van huis', indonesian: 'Tono dari rumah' },
            { dutch: 'Moeder zit voor het huis', indonesian: 'Ibu duduk di depan rumah' },
            { dutch: 'Waar komt Amir vandaan?', indonesian: 'Amir dari mana?' },
            { dutch: 'Hoe heet die persoon?', indonesian: 'Siapa nama orang itu?' },
            { dutch: 'Waar gaat u heen meneer Suparman?', indonesian: 'Bapak Suparman mau ke mana?' },
          ],
        },
        order_index: 0,
      },
    ],
  },
]
