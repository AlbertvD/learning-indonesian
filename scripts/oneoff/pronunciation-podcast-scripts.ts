// Authored two-host scripts for the L1-specific pronunciation podcasts (ADR 0025,
// issue #315). DRAFT — pending linguist-reviewer pass on phonetic accuracy, the
// Indonesian example words, and NL/EN naturalness.
//
// This is the INPUT to the one-off producer (scripts/oneoff/pronunciation-podcast.ts):
// each host line is a complete conversational turn, synthesised as one SSML
// document with its speaker's Chirp3-HD voice (nl-NL / en-US); `id` lines are
// native Indonesian example words (routed through synthesizeSpeech so the
// Chirp3-HD short-word→Wavenet fallback protects them). The producer interleaves
// a synthesised silence gap between all segments before concatenation.
//
// Example words are drawn from the vetted pitfall catalog (src/lib/pronunciation/
// pitfallCatalog.ts). Two hosts: A = guide, B = curious learner.
//
// Voices are sensible defaults and tunable by the operator before running.

export type LineLang = 'nl' | 'en' | 'id'

export interface PodcastLine {
  speaker: 'A' | 'B'
  lang: LineLang
  text: string
}

export interface PodcastEpisode {
  l1: 'nl' | 'en'
  /** texts.title (UNIQUE) */
  title: string
  /** texts.description */
  description: string
  voiceA: string
  voiceB: string
  /** id-ID voice for example words */
  exampleVoice: string
  lines: PodcastLine[]
}

// Native Indonesian example voice — the same Chirp3-HD family as the in-app
// pitfall clips, so podcast examples and tappable examples share one voice
// world. The producer routes id lines through synthesizeSpeech, so the
// documented short-word→Wavenet fallback still protects ≤2-char/known-bad words.
const ID_VOICE = 'id-ID-Chirp3-HD-Despina'

const A = (lang: LineLang, text: string): PodcastLine => ({ speaker: 'A', lang, text })
const B = (lang: LineLang, text: string): PodcastLine => ({ speaker: 'B', lang, text })
const ID = (text: string): PodcastLine => ({ speaker: 'A', lang: 'id', text })

export const NL_EPISODE: PodcastEpisode = {
  l1: 'nl',
  title: 'Uitspraak — voor Nederlandstaligen',
  description: 'De Indonesische klanken die Nederlandstaligen het vaakst verkeerd doen, in één aflevering. Luister en spreek mee.',
  voiceA: 'nl-NL-Chirp3-HD-Despina',
  voiceB: 'nl-NL-Chirp3-HD-Orus',
  exampleVoice: ID_VOICE,
  lines: [
    A('nl', 'Welkom bij Kamoe Bisa! Vandaag duiken we in de Indonesische uitspraak — speciaal voor ons, Nederlandstaligen.'),
    B('nl', 'Mooi, want ik maak vast fouten zonder dat ik het doorheb.'),
    A('nl', 'Precies daarom. Het goede nieuws: Indonesisch is fonetisch — je leest het zoals het er staat. Er zijn maar een handvol klanken die wij standaard verkeerd doen.'),

    A('nl', 'Laten we beginnen met de e. Die heeft twee klanken. Een stomme e, zoals in "de", hoor je in:'),
    ID('besar'),
    ID('beli'),
    A('nl', 'En een heldere é, zoals in "mee", in:'),
    ID('sore'),
    B('nl', 'En de spelling laat dat verschil niet zien?'),
    A('nl', 'Nee, dat leer je per woord. Luister naar "enam", het getal zes:'),
    ID('enam'),

    A('nl', 'Nu een klassieke valkuil: de g. Wij maken er vaak de zachte keel-g van, zoals in "gaan". Maar in het Indonesisch is het altijd een harde g, zoals in het Engelse "go".'),
    ID('gampang'),
    ID('gelas'),
    ID('gigi'),
    B('nl', 'Dus niet met onze keel-g, maar een harde g: "gampang".'),
    A('nl', 'Precies. Hoor het verschil tussen "gali", graven, en "kali", met een k:'),
    ID('gali'),
    ID('kali'),

    A('nl', 'De letter c spreek je altijd uit als "tj", zoals in "tjalk" of het Engelse "church". Nooit als k of s.'),
    ID('cinta'),
    ID('kecil'),
    ID('cuci'),
    B('nl', 'Dus "cinta" klinkt als "tjinta".'),
    A('nl', 'Ja. En let op het paar "cari", zoeken, tegenover "kari", kerrie:'),
    ID('cari'),
    ID('kari'),

    A('nl', 'De j is ook een instinker. Bij ons is dat de j van "jas". In het Indonesisch klinkt hij als de Engelse j, een "dzj", zoals in "James".'),
    ID('jam'),
    ID('jalan'),
    ID('belajar'),
    B('nl', 'Dus "belajar", leren, met een zachte dzj.'),
    A('nl', 'Goed zo.'),

    A('nl', 'Dan de w. Gebruik de Engelse w, met ronde lippen, zoals in "wow" — niet onze meer v-achtige w.'),
    ID('waktu'),
    ID('warna'),
    ID('bawa'),

    A('nl', 'De combinatie ng is één klank, zoals in "lang" of "zingen". Laat geen aparte g horen.'),
    ID('dengan'),
    ID('orang'),
    ID('uang'),

    A('nl', 'Tot slot: eindmedeklinkers. Spreek ze duidelijk uit, maar zonder extra klank. De eind-k is vaak een lichte keelslag.'),
    ID('anak'),
    ID('tidak'),
    A('nl', 'En verwar de eind-n en de eind-m niet. Hoor "makan", eten, tegenover "makam", graf:'),
    ID('makan'),
    ID('makam'),
    B('nl', 'Eén kleine letter, een heel ander woord.'),

    A('nl', 'Precies. Oefen deze klanken hardop, dan klink je al snel veel natuurlijker. Tot de volgende keer!'),
    B('nl', 'Sampai jumpa!'),
  ],
}

export const EN_EPISODE: PodcastEpisode = {
  l1: 'en',
  title: 'Pronunciation — for English speakers',
  description: 'The Indonesian sounds English speakers most often get wrong, in one episode. Listen and say them along.',
  voiceA: 'en-US-Chirp3-HD-Despina',
  voiceB: 'en-US-Chirp3-HD-Orus',
  exampleVoice: ID_VOICE,
  lines: [
    A('en', "Welcome to Kamoe Bisa! Today we're tackling Indonesian pronunciation — the sounds English speakers tend to trip on."),
    B('en', "Which I need, because I have no idea what I'm getting wrong."),
    A('en', "Good news first: Indonesian is phonetic and has no tones — you say it the way it's spelled. There's just a short list of sounds to fix."),

    A('en', "Start with the letter e. It has two sounds. A schwa — like the 'a' in 'ago' — in:"),
    ID('besar'),
    ID('beli'),
    A('en', "And a clear é — like the 'e' in 'café' — in:"),
    ID('sore'),
    B('en', "And the spelling doesn't tell you which?"),
    A('en', 'Right — you learn it per word.'),

    A('en', "Now the big one for English speakers: the r. Don't use the English r. It's a tapped or rolled r, made with the tip of the tongue — like Spanish."),
    ID('rumah'),
    ID('lari'),
    ID('kerja'),
    B('en', 'So a little flick of the tongue.'),
    A('en', "Exactly. Hear it against an l — 'rusa', deer, versus 'lusa', the day after tomorrow:"),
    ID('rusa'),
    ID('lusa'),

    A('en', "Next, keep your vowels pure. English glides them — 'o' drifts to 'ow', 'e' to 'ey'. In Indonesian, a, i, u, e, o each stay one steady sound."),
    ID('kota'),
    ID('baju'),
    ID('satu'),
    B('en', "So 'kota', not 'kow-ta'."),
    A('en', "You've got it."),

    A('en', "Watch your p, t, and k. In English we puff air after them — 'pin', 'top', 'key'. In Indonesian, hold that air back."),
    ID('pagi'),
    ID('tiga'),
    ID('kaki'),

    A('en', "The letter c is always 'ch', as in 'church' — never k or s."),
    ID('cinta'),
    ID('kecil'),
    A('en', "And the pair 'cari', to look for, versus 'kari', curry:"),
    ID('cari'),
    ID('kari'),

    A('en', "ng is a single sound, like in 'singer' — not n plus g."),
    ID('dengan'),
    ID('orang'),
    A('en', "And a tricky one: Indonesian uses that ng at the START of words, which English never does. Try:"),
    ID('ngeri'),
    ID('ngantuk'),
    B('en', 'That feels strange to begin a word with.'),
    A('en', 'It does at first — practise it slowly.'),

    A('en', 'Last, final consonants: clear but not released. A final k is often a light catch in the throat.'),
    ID('anak'),
    ID('tidak'),
    A('en', "And don't blur final n and m — 'makan', to eat, versus 'makam', grave:"),
    ID('makan'),
    ID('makam'),

    A('en', "Practise these out loud and you'll sound much more natural, fast. See you next time!"),
    B('en', 'Sampai jumpa!'),
  ],
}

export const EPISODES: PodcastEpisode[] = [NL_EPISODE, EN_EPISODE]
