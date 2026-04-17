// src/lib/semanticGroups.ts
// Keyword-based semantic grouping for MCQ distractor selection.
// See docs/plans/2026-04-17-pos-aware-distractors-design.md for rationale
// and the scaling plan.

export const SEMANTIC_GROUPS_NL: Array<{ name: string; keywords: string[] }> = [
  { name: 'numbers', keywords: ['nul', 'één', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'elf', 'twaalf', 'dertien', 'veertien', 'vijftien', 'twintig', 'dertig', 'veertig', 'vijftig', 'zestig', 'zeventig', 'tachtig', 'negentig', 'honderd', 'duizend', 'nummer', 'getal'] },
  { name: 'greetings', keywords: ['goedemorgen', 'goedemiddag', 'goedenavond', 'goedenacht', 'goedendag', 'hallo', 'hoi', 'dag', 'welkom', 'tot ziens', 'doei', 'hoe gaat het', 'hoe maakt u het'] },
  { name: 'food', keywords: ['rijst', 'kip', 'vlees', 'vis', 'groente', 'fruit', 'saté', 'nasi', 'brood', 'soep', 'noedel', 'tempeh', 'tofu', 'ei', 'maaltijd', 'eten', 'drinken', 'water', 'koffie', 'thee', 'melk', 'sap', 'bier', 'wijn'] },
  { name: 'transport', keywords: ['auto', 'fiets', 'motor', 'bus', 'trein', 'taxi', 'vliegtuig', 'boot', 'vliegveld', 'station', 'rijden', 'vliegen', 'varen'] },
  { name: 'places', keywords: ['huis', 'school', 'restaurant', 'kantoor', 'winkel', 'markt', 'ziekenhuis', 'hotel', 'strand', 'stad', 'dorp', 'land', 'straat', 'gebouw', 'bank', 'bibliotheek', 'kerk', 'moskee', 'park'] },
  { name: 'household', keywords: ['bed', 'stoel', 'tafel', 'kast', 'deur', 'raam', 'bord', 'lepel', 'vork', 'mes', 'glas', 'kop', 'pan', 'zeep', 'handdoek', 'spiegel', 'lamp', 'boek', 'pen', 'sleutel'] },
  { name: 'family', keywords: ['vader', 'moeder', 'broer', 'zus', 'kind', 'zoon', 'dochter', 'opa', 'oma', 'oom', 'tante', 'neef', 'nicht', 'man', 'vrouw', 'vriend', 'vriendin', 'echtgenoot', 'echtgenote', 'familie', 'gezin'] },
  { name: 'question_words', keywords: ['wat?', 'wie?', 'waar?', 'wanneer?', 'waarom?', 'hoe?', 'hoeveel?', 'welk?', 'welke?'] },
  { name: 'colors', keywords: ['rood', 'blauw', 'groen', 'geel', 'zwart', 'wit', 'bruin', 'oranje', 'paars', 'roze', 'grijs', 'kleur'] },
  { name: 'body', keywords: ['hoofd', 'oog', 'oor', 'neus', 'mond', 'tand', 'tong', 'hals', 'arm', 'hand', 'vinger', 'been', 'voet', 'teen', 'buik', 'rug', 'hart', 'lichaam'] },
  { name: 'time', keywords: ['dag', 'nacht', 'ochtend', 'middag', 'avond', 'week', 'maand', 'jaar', 'uur', 'minuut', 'seconde', 'gisteren', 'vandaag', 'morgen', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag', 'januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'] },
  { name: 'pronouns', keywords: ['ik', 'jij', 'hij', 'zij', 'wij', 'jullie', 'zij ', 'mij', 'jou', 'hem', 'haar', 'ons', 'hen', 'zelf'] },
  { name: 'adjectives_size', keywords: ['groot', 'klein', 'lang', 'kort', 'breed', 'smal', 'hoog', 'laag', 'dik', 'dun', 'zwaar', 'licht'] },
  { name: 'adjectives_quality', keywords: ['goed', 'slecht', 'mooi', 'lelijk', 'schoon', 'vies', 'nieuw', 'oud', 'snel', 'langzaam', 'goedkoop', 'duur', 'makkelijk', 'moeilijk', 'warm', 'koud'] },
  { name: 'politeness', keywords: ['alstublieft', 'dank u wel', 'bedankt', 'sorry', 'pardon', 'graag', 'excuseer'] },
  { name: 'emotions', keywords: ['liefde', 'haat', 'blij', 'verdrietig', 'bang', 'boos', 'zorg', 'hoop', 'jaloers', 'gelukkig', 'ongelukkig', 'woede', 'angst', 'vreugde'] },
  { name: 'mental_states', keywords: ['denken', 'herinneren', 'vergeten', 'weten', 'begrijpen', 'geloven', 'overwegen', 'menen', 'besluiten', 'twijfel'] },
  { name: 'abstract_concepts', keywords: ['vrijheid', 'waarheid', 'probleem', 'idee', 'reden', 'betekenis', 'mening', 'gedachte', 'recht', 'plicht'] },
]

export const SEMANTIC_GROUPS_EN: Array<{ name: string; keywords: string[] }> = [
  { name: 'numbers', keywords: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'number', 'digit'] },
  { name: 'greetings', keywords: ['good morning', 'good afternoon', 'good evening', 'good night', 'hello', 'hi', 'goodbye', 'welcome', 'see you', 'how are you'] },
  { name: 'food', keywords: ['rice', 'chicken', 'meat', 'fish', 'vegetable', 'fruit', 'satay', 'bread', 'soup', 'noodle', 'tempeh', 'tofu', 'egg', 'meal', 'eat', 'drink', 'water', 'coffee', 'tea', 'milk', 'juice', 'beer', 'wine'] },
  { name: 'transport', keywords: ['car', 'bicycle', 'bike', 'motorcycle', 'bus', 'train', 'taxi', 'airplane', 'boat', 'airport', 'station', 'drive', 'fly', 'sail'] },
  { name: 'places', keywords: ['house', 'home', 'school', 'restaurant', 'office', 'shop', 'store', 'market', 'hospital', 'hotel', 'beach', 'city', 'village', 'country', 'street', 'building', 'bank', 'library', 'church', 'mosque', 'park'] },
  { name: 'household', keywords: ['bed', 'chair', 'table', 'cupboard', 'door', 'window', 'plate', 'spoon', 'fork', 'knife', 'glass', 'cup', 'pan', 'soap', 'towel', 'mirror', 'lamp', 'book', 'pen', 'key'] },
  { name: 'family', keywords: ['father', 'mother', 'brother', 'sister', 'child', 'son', 'daughter', 'grandfather', 'grandmother', 'uncle', 'aunt', 'cousin', 'husband', 'wife', 'friend', 'family'] },
  { name: 'question_words', keywords: ['what?', 'who?', 'where?', 'when?', 'why?', 'how?', 'how many?', 'which?'] },
  { name: 'colors', keywords: ['red', 'blue', 'green', 'yellow', 'black', 'white', 'brown', 'orange', 'purple', 'pink', 'grey', 'gray', 'color', 'colour'] },
  { name: 'body', keywords: ['head', 'eye', 'ear', 'nose', 'mouth', 'tooth', 'tongue', 'neck', 'arm', 'hand', 'finger', 'leg', 'foot', 'toe', 'stomach', 'back', 'heart', 'body'] },
  { name: 'time', keywords: ['day', 'night', 'morning', 'afternoon', 'evening', 'week', 'month', 'year', 'hour', 'minute', 'second', 'yesterday', 'today', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
  { name: 'pronouns', keywords: ['i ', ' me', 'you', 'he', 'she', 'we', 'they', 'him', 'her', 'us', 'them', 'myself', 'yourself'] },
  { name: 'adjectives_size', keywords: ['big', 'large', 'small', 'little', 'long', 'short', 'wide', 'narrow', 'high', 'tall', 'low', 'thick', 'thin', 'heavy', 'light'] },
  { name: 'adjectives_quality', keywords: ['good', 'bad', 'beautiful', 'ugly', 'clean', 'dirty', 'new', 'old', 'fast', 'slow', 'cheap', 'expensive', 'easy', 'difficult', 'hard', 'warm', 'hot', 'cold'] },
  { name: 'politeness', keywords: ['please', 'thank you', 'thanks', 'sorry', 'excuse me', 'pardon', 'welcome', 'you\'re welcome'] },
  { name: 'emotions', keywords: ['love', 'hate', 'happy', 'sad', 'fear', 'afraid', 'anger', 'angry', 'worry', 'hope', 'jealous', 'joyful', 'sorrow', 'pleasure'] },
  { name: 'mental_states', keywords: ['think', 'remember', 'forget', 'know', 'understand', 'believe', 'consider', 'decide', 'doubt', 'opinion'] },
  { name: 'abstract_concepts', keywords: ['freedom', 'truth', 'problem', 'idea', 'reason', 'meaning', 'opinion', 'thought', 'right', 'duty'] },
]

export function getSemanticGroup(translation: string, language: 'en' | 'nl'): string | null {
  const lower = translation.toLowerCase()
  const groups = language === 'nl' ? SEMANTIC_GROUPS_NL : SEMANTIC_GROUPS_EN
  for (const group of groups) {
    if (group.keywords.some(kw => lower.includes(kw))) {
      return group.name
    }
  }
  return null
}
