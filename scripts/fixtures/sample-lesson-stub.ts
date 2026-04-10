/**
 * sample-lesson-stub.ts — fixture for build-sections and generate-exercises unit tests
 *
 * Represents a lesson with one unstructured grammar section and one unstructured
 * exercises section (as generate-staging-files.ts emits them from catalog raw_text).
 */

export const sampleLessonStub = {
  title: 'Les 4 - Bij de warung',
  description: '',
  level: 'A1',
  module_id: 'module-1',
  order_index: 4,
  sections: [
    {
      title: 'Woordenlijst',
      order_index: 0,
      content: {
        type: 'vocabulary',
        items: [
          { indonesian: 'air', dutch: 'water' },
          { indonesian: 'makan', dutch: 'eten' },
          { indonesian: 'besar', dutch: 'groot' },
          { indonesian: 'kecil', dutch: 'klein' },
          { indonesian: 'rumah', dutch: 'huis' },
          { indonesian: 'sendok', dutch: 'lepel' },
          { indonesian: 'pisang', dutch: 'banaan' },
        ],
      },
    },
    {
      title: 'Grammatica: YANG - Constructie',
      order_index: 1,
      content: {
        type: 'grammar',
        body: `Yang als betrekkelijk voornaamwoord (die/dat):
Yang koppelt als betrekkelijk voornaamwoord een bijzin aan het voorgaande zelfstandig naamwoord.
Voorbeelden:
Pisang yang terlalu tua tidak enak = Een banaan die te oud is, is niet lekker
Ini orang Belanda yang tinggal di Bogor = Dit is de Nederlander die in Bogor woont

Yang maakt zelfstandige naamwoorden (nominalisering):
Yang kan bijvoeglijke naamwoorden, werkwoorden en andere woordsoorten omzetten.
Voorbeelden:
Yang mahal bagus = De dure (dingen) zijn mooi
Yang tidur banyak = Degenen die slapen zijn talrijk

Yang bij één bijvoeglijk naamwoord (nadruk):
Yang vóór één bijvoeglijk naamwoord geeft nadruk aan die eigenschap.
Voorbeelden:
Rumah yang besar = Het GROTE huis
Sendok yang bersih = De SCHONE lepel`,
      },
    },
    {
      title: 'Oefeningen',
      order_index: 2,
      content: {
        type: 'exercises',
        body: `Oefening I. Vertaal en gebruik in elke zin yang.
1. Het huis van Jan dat groot is, is mooi. → Rumah Jan yang besar bagus
2. De fiets van Fedi die nieuw is, is schoon. → Sepeda Fedi yang baru bersih
3. Waar is de nieuwe school? → Di mana sekolah yang baru?
4. De kleine auto is snel. → Mobil yang kecil cepat

Oefening II. Maak zinnen met yang (nominalisering).
1. Wat duur is, is mooi. → Yang mahal bagus
2. Wat groot is, is lekker. → Yang besar enak`,
      },
    },
  ],
}
