export interface LessonData {
  module_id: string
  level: string
  title: string
  description: string
  order_index: number
  audio_filename?: string // local file name for upload (e.g. "lesson-1.mp3"); seeder prepends "lessons/"
  duration_seconds?: number
  transcript_dutch?: string | null
  transcript_indonesian?: string | null
  transcript_english?: string | null
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
    audio_filename: 'lesson-1.m4a',
    duration_seconds: 780,
    transcript_dutch: `Welkom bij Les 1 van de Indonesische taalcursus!

In deze les leer je de basis van het Indonesisch (Bahasa Indonesia), de officiële taal van Indonesië, gesproken door meer dan 270 miljoen mensen.

Het Indonesisch staat bekend om zijn relatief eenvoudige grammatica vergeleken met Europese talen:
- Geen werkwoordvervoegingen
- Geen grammaticaal geslacht
- Geen complex tijdensysteem

Dit maakt het een van de makkelijkere talen om te leren voor sprekers van Europese talen.

Uitspraakregels:
- Indonesische woorden moeten rustig en zonder klemtoon worden uitgesproken
- Een gelijkmatig ritme is belangrijk
- De woorden zijn over het algemeen niet lang

Belangrijke klanken:
- c = tj (zoals in 'cukup')
- j = dj (zoals in 'Jakarta')
- u = oe (zoals in 'Ibu')
- ny = nj (zoals in 'nyonya')

Grammatica punten:
1. Werkwoorden worden niet vervoegd
2. Zelfstandige naamwoorden hebben geen lidwoorden
3. Bijvoeglijke naamwoorden komen NA het zelfstandig naamwoord

Veel succes met leren!`,
    transcript_indonesian: null,
    transcript_english: null,
    sections: [
      {
        title: 'Uitspraak (Pronunciation)',
        content: {
          type: 'text',
          intro: 'De Indonesische woorden kan men in het begin het best rustig en zonder klemtoon uitspreken. Van belang bij de uitspraak is een gelijkmatig ritme. Hierbij worden we geholpen door het feit dat de woorden over het algemeen niet lang zijn en een indeling in lettergrepen makkelijk te maken is.',
          examples: [
            { indonesian: 'Selamat datang', phonetic: 'Se-la-mat da-tang', dutch: 'Welkom' },
            { indonesian: 'Apa kabar?', phonetic: 'A-pa ka-bar?', dutch: 'Hoe is het ermee?' },
            { indonesian: 'Baik, terima kasih', phonetic: 'Ba-ik, te-ri-ma ka-sih', dutch: 'Goed, dank u wel' },
            { indonesian: 'Bapak ke Bandung?', phonetic: 'Ba-pak ke Ban-dung?', dutch: 'Gaat u naar Bandung?' },
          ],
          spelling: [
            { rule: 'c = tj', example: 'cukup (tjoekoep)', dutch: 'voldoende' },
            { rule: 'j = dj', example: 'Jakarta (Djakarta)', dutch: 'Jakarta' },
            { rule: 'u = oe', example: 'Ibu (Iboe)', dutch: 'mevrouw, u' },
            { rule: 'y = j', example: 'Surabaya (Soerabaja)', dutch: 'Surabaya' },
            { rule: 'ny = nj', example: 'nyonya (njonja)', dutch: 'mevrouw, u' },
            { rule: 'kh = ch', example: 'akhir (achir)', dutch: 'einde' },
          ],
          sentences: [
            { indonesian: 'Saya ke pasar', dutch: 'Ik ga/ging naar de/een markt' },
            { indonesian: 'Saya beli buah', dutch: 'Ik koop/kocht een vrucht/vruchten' },
            { indonesian: 'Bapak beli buah-buahan', dutch: 'Meneer koopt/kocht fruit' },
            { indonesian: 'Bapak dan Ibu beli nanas', dutch: 'Meneer en mevrouw kopen/kochten een ananas' },
            { indonesian: 'Saya mau beli rumah besar', dutch: 'Ik wil/wilde een groot huis kopen' },
          ],
        },
        order_index: 0,
      },
      {
        title: 'Grammatica (Grammar)',
        content: {
          type: 'grammar',
          intro: 'In de voorgaande Indonesische zinnen zijn enkele bijzonderheden op te merken.',
          categories: [
            {
              title: 'Werkwoord',
              rules: [
                'Zinnen zonder een werkwoord zijn heel gewoon.',
                'Werkwoorden worden niet vervoegd naar enkel- of meervoud.',
                'Werkwoorden worden niet vervoegd naar tegenwoordige of verleden tijd. Tenzij uit de context anders blijkt, vertaalt men het werkwoord in de tegenwoordige tijd.',
                'Werkwoorden worden bij elkaar gezet.',
              ],
            },
            {
              title: 'Zelfstandig naamwoord',
              rules: [
                'Zelfstandige naamwoorden hebben geen lidwoord (de, het, een).',
                'Er wordt bij zelfstandige naamwoorden geen onderscheid gemaakt tussen enkelvoud en meervoud.',
                'Herhaling van een zelfstandig naamwoord geeft meervoud of verscheidenheid aan.',
                'Als uit de context blijkt dat er sprake is van meervoud of verscheidenheid, wordt een zelfstandig naamwoord niet verdubbeld (2 huizen = dua rumah en niet dua rumah-rumah).',
              ],
            },
            {
              title: 'Bijvoeglijk naamwoord',
              rules: [
                'Het bijvoeglijk naamwoord wordt achter het zelfstandig naamwoord geplaatst.',
              ],
            },
          ],
        },
        order_index: 1,
      },
      {
        title: 'Di Pasar (At the Market)',
        content: {
          type: 'dialogue',
          setup: 'Ibu mau ke pasar. Mau beli pisang.',
          lines: [
            { speaker: 'Ibu', text: 'Pak, saya mau beli 3 (tiga) buah pisang. Berapa harganya?' },
            { speaker: 'Penjual', text: 'Harganya murah Bu, 8 (delapan) rupiah.' },
            { speaker: 'Ibu', text: 'Itu mahal ya! 4 (empat) rupiah boleh?' },
            { speaker: 'Penjual', text: 'Belum bisa Bu. Tetapi kalau mau 5 (lima) buah, bisa 9 (sembilan) rupiah.' },
          ],
        },
        order_index: 2,
      },
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
        order_index: 3,
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
        order_index: 4,
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
        order_index: 5,
      },
    ],
  },
  {
    module_id: 'module-1',
    level: 'A1',
    title: 'Les 2 - Di Indonesia (In Indonesië)',
    description: 'Learn the SE- prefix, ini/itu (this/that), negation with tidak, and adjectives.',
    order_index: 2,
    audio_filename: 'lesson-2.m4a',
    duration_seconds: 600,
    transcript_dutch: `Welkom bij Les 2 van de Indonesische taalcursus!

In deze les leer je over:
- Het voorvoegsel SE- (seorang, sebuah, seekor)
- Ini en Itu (dit/dat)
- Ontkenning met tidak
- Bijvoeglijke naamwoorden

Veel succes met leren!`,
    transcript_indonesian: null,
    transcript_english: null,
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
    audio_filename: 'lesson-3.m4a',
    duration_seconds: 600,
    transcript_dutch: `Welkom bij Les 3 van de Indonesische taalcursus!

In deze les leer je over:

1. Ada - "er is" of "er zijn"
   - Di sana ada banyak mobil = Er zijn daar veel auto's
   - Ada is GEEN koppelwerkwoord

2. Vraagwoorden:
   - Apa? = Wat?
   - Berapa? = Hoeveel?
   - Di mana? = Waar?
   - Ke mana? = Waarheen?
   - Siapa? = Wie?

3. Sekali - "zeer, erg, heel"
   - Hotel itu mahal sekali = Dat hotel is erg duur

4. Woorden van plaats: dari, di, ke

Veel succes met leren!`,
    transcript_indonesian: null,
    transcript_english: null,
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
