export interface PodcastData {
  title: string
  description: string | null
  level: string
  duration_seconds: number
  audio_filename: string // local file name for upload (e.g. "lesson-1.mp3")
  transcript_dutch: string | null
  transcript_indonesian: string | null
  transcript_english: string | null
}

export const podcasts: PodcastData[] = [
  {
    title: 'Les 1: Indonesisch leren zonder vervoegingen en lidwoorden',
    description: 'Audio uitleg bij Les 1 - Inleiding tot het Indonesisch. Leer over de eenvoudige grammatica van het Indonesisch.',
    level: 'A1',
    duration_seconds: 780,
    audio_filename: 'lesson-1.m4a',
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
  },
  {
    title: 'Les 2: In Indonesië',
    description: 'Audio uitleg bij Les 2 - Di Indonesia.',
    level: 'A1',
    duration_seconds: 600,
    audio_filename: 'lesson-2.mp3',
    transcript_dutch: `Welkom bij Les 2 van de Indonesische taalcursus!

In deze les leer je over:
- Het voorvoegsel SE- (seorang, sebuah, seekor)
- Ini en Itu (dit/dat)
- Ontkenning met tidak
- Bijvoeglijke naamwoorden

Veel succes met leren!`,
    transcript_indonesian: null,
    transcript_english: null,
  },
  {
    title: 'Les 3: Op het vliegveld',
    description: 'Audio uitleg bij Les 3 - Di Bandar Udara.',
    level: 'A1',
    duration_seconds: 600,
    audio_filename: 'lesson-3.mp3',
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
  },
]
