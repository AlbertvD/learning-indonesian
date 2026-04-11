// Grammar patterns for Lesson 4 — Di Hotel
// Focus: YANG construction — relative pronoun, nominalization, adjective emphasis, existential
// 6 patterns — none exist in indonesian.grammar_patterns DB yet; will be created on publish
export const grammarPatterns = [
  {
    pattern_name: "YANG - Relative Pronoun",
    description: "Yang used as relative pronoun (die/dat) to introduce relative clauses after a noun. Mandatory after compound nouns (kamar mandi, tempat tidur) and after possessive pronouns with adjectives.",
    confusion_group: "yang-functions",
    page_reference: 5,
    slug: "yang-relative-pronoun",
    complexity_score: 3
  },
  {
    pattern_name: "YANG - Nominalization",
    description: "Yang at the start of a phrase converts adjectives, verbs, and numbers into nouns: 'yang mahal' = the expensive one(s), 'yang tidur' = those who sleep, 'yang dua ini' = these two.",
    confusion_group: "yang-functions",
    page_reference: 5,
    slug: "yang-nominalization",
    complexity_score: 5
  },
  {
    pattern_name: "YANG - Single Adjective Emphasis",
    description: "Yang before a single adjective adds contrastive emphasis: 'rumah yang besar' = the BIG house (as opposed to the small one). Without yang, 'rumah besar' is neutral.",
    confusion_group: "yang-adjective-patterns",
    page_reference: 5,
    slug: "yang-single-adjective-emphasis",
    complexity_score: 4
  },
  {
    pattern_name: "YANG - Two Adjectives (Unequal Emphasis)",
    description: "With two adjectives where one is emphasized: [noun] [adj] yang [emphasized adj]. The adjective after yang receives contrastive emphasis: 'rumah besar yang kuning' = the YELLOW big house.",
    confusion_group: "yang-adjective-patterns",
    page_reference: 6,
    slug: "yang-two-adj-unequal",
    complexity_score: 6
  },
  {
    pattern_name: "YANG - Two Adjectives (Equal Emphasis)",
    description: "With two adjectives of equal importance: [noun] yang [adj] dan [adj]. Both adjectives receive equal weight: 'rumah yang besar dan kuning' = the big and yellow house.",
    confusion_group: "yang-adjective-patterns",
    page_reference: 6,
    slug: "yang-two-adj-equal",
    complexity_score: 6
  },
  {
    pattern_name: "Ada yang... - Existential with YANG",
    description: "Fixed expression meaning 'there are those who...' or 'some..., others...'. Used to partition a group: 'ada yang dari Belanda dan ada yang dari Jerman' = some are from the Netherlands and some from Germany.",
    confusion_group: "yang-functions",
    page_reference: 6,
    slug: "ada-yang-existential",
    complexity_score: 5
  }
]
