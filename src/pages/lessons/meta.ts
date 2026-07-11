// Hand-maintained lightweight metadata for the 30 bespoke lessons, extracted
// from each lesson's content.json `meta` block (id / orderIndex / title /
// level / description only — no sections, no dialogue, no audio manifests).
//
// This module deliberately imports NO content.json. Before this file
// existed, src/pages/lessons/registry.tsx statically imported all 30
// content.json files (~1.5MB) just to read their `meta` blocks, which
// defeated the per-lesson Page lazy-splitting: visiting the Lessons list or
// any single lesson downloaded every lesson's full content
// (2026-07-11 prod-ready audit, HIGH bundle finding). Each lesson's
// content.json is imported exactly once now, inside that lesson's own
// `Page.tsx` (see lesson-N/Page.tsx), so it rides in that lesson's lazy
// chunk instead of the shared registry.
//
// src/pages/lessons/__tests__/meta.test.ts dynamically imports every
// content.json at TEST TIME ONLY (vitest, not the app bundle) and asserts
// this array matches — so these literals can never silently drift from the
// source JSON.
//
// To publish a new lesson's bespoke page:
//   1. Author the page at src/pages/lessons/lesson-<N>/Page.tsx + content.json
//   2. Append its {id, orderIndex, title, level, description} below, in
//      order_index order, and add the matching lazy import + array entry in
//      registry.tsx
//   3. The /lesson/<uuid> route automatically picks it up

export interface BespokeLessonMeta {
  id: string
  orderIndex: number
  title: string
  level: string
  description: string | null
}

export const bespokeLessonMetas: BespokeLessonMeta[] = [
  { id: "cb78cfa6-0146-4e65-89fd-da692642f6bf", orderIndex: 1, title: "Les 1 - Di Pasar (Op de markt)", level: "A1", description: "Leer de basisuitspraakregels van het Indonesisch, essenti\u00eble grammaticaprincipes (werkwoord, zelfstandig naamwoord, bijvoeglijk naamwoord), en oefen met een marktdialoog en de getallen 0-10." },
  { id: "0dfebf04-2720-4ddf-a832-245d90f22a26", orderIndex: 2, title: "Les 2 - Di Indonesia (In Indonesie)", level: "A1", description: "Leer de SE- prefix, ini/itu (dit/dat) als aanwijzend voornaamwoord en woordgroepmarkeerder, ontkenning met tidak, bijvoeglijke naamwoorden en de getallen 11-20." },
  { id: "bb44d8ba-f5b1-48d6-83de-fb30f0425768", orderIndex: 3, title: "Les 3 - Di Bandar Udara (Op het vliegveld)", level: "A1", description: "Leer ada (er is/zijn), vraagwoorden, sekali (erg/heel), woorden van plaats (dari, di, ke) en de getallen 10-100. Oefen met een dialoog op vliegveld Soekarno-Hatta." },
  { id: "5b5c4be8-cf04-4f72-a818-c92519a4ed6a", orderIndex: 4, title: "Les 4 - Di Hotel", level: "A1", description: "Accommodation and dining in Indonesia. Grammar focus: YANG constructie (relative pronouns and emphasis patterns)" },
  { id: "c224ca54-46e8-4052-a65b-eda119f8c7ec", orderIndex: 5, title: "Les 5 - Belajar", level: "A1", description: "Family dialogue about studying at home. Grammar focus: personal pronouns (persoonlijk voornaamwoord) and possessive pronouns (bezittelijk voornaamwoord), including kami vs kita distinction." },
  { id: "1817ddaa-f529-49d7-9773-8cc5ba90dc50", orderIndex: 6, title: "Les 6 - Jakarta", level: "A1", description: "History of Jakarta (Batavia). Grammar focus: negation system (belum/bukan/tidak/jangan), imperative with -lah, question suffix -kah, Indonesian day parts and clock time." },
  { id: "c047748e-7837-4852-97e5-efcf6bfdba7f", orderIndex: 7, title: "Les 7 - Libur Sekolah", level: "A2", description: "" },
  { id: "c5462305-09d7-400e-a88a-101e67267c74", orderIndex: 8, title: "Les - Batik", level: "A2", description: "" },
  { id: "93c54586-3542-47ec-9a60-26a97c8c5a3d", orderIndex: 9, title: "Les - Ke Puskesmas / Dukun en Jamu", level: "A2", description: "" },
  { id: "0122e8d6-b673-4963-91f8-142361ab91a7", orderIndex: 10, title: "Les 10 - Ke Kantor Pos", level: "A2", description: "" },
  { id: "346ca09f-a342-4133-aeae-5739cd65c001", orderIndex: 11, title: "Les 11 - Candi Borobudur", level: "A2", description: "" },
  { id: "3a0b74bd-954d-448a-a5e2-8128d7a9f3d0", orderIndex: 12, title: "Les 12 - Di Stasiun Gambir di Jakarta", level: "A2", description: "" },
  { id: "a77ea7f0-2212-4de0-8709-a5687235e088", orderIndex: 13, title: "Les 13 - Tukar Uang", level: "B1", description: "" },
  { id: "3d97571d-2bae-448c-b1fe-6fed15b618a7", orderIndex: 14, title: "Les 14 - De islam in Indonesi\u00eb", level: "B1", description: "" },
  { id: "1a7e6903-0d78-4eb5-b0a5-9f1c41044499", orderIndex: 15, title: "Les 15 - Wayang di Indonesia", level: "B1", description: "" },
  { id: "bdf7293e-b036-4817-a164-a39797fb377c", orderIndex: 16, title: "Les 16 - Di Kantor Pos", level: "B1", description: "" },
  { id: "80e82703-b33a-480f-bfc6-34a257e515a5", orderIndex: 17, title: "Telur Mata Sapi", level: "B1", description: "" },
  { id: "a00a24a7-e4ce-4aee-bed9-322c449297f6", orderIndex: 18, title: "Mampir", level: "B1", description: "" },
  { id: "5bbdb547-7535-4cd3-b685-faa3c331981b", orderIndex: 19, title: "Zinsbouw", level: "B1", description: "" },
  { id: "17068386-b35d-4f6a-a7c8-64105ab0d630", orderIndex: 20, title: "Biar Lambat Asal Selamat", level: "B1", description: "" },
  { id: "f0b6c5b4-24d0-4938-90bf-2303a8e7234d", orderIndex: 21, title: "Dongeng", level: "B1", description: "" },
  { id: "e300259d-8d01-4484-b0b2-82dd54f373ed", orderIndex: 22, title: "Pesta Pernikahan", level: "B1", description: "" },
  { id: "fb35a2f1-25af-45cc-a655-e20d73845b22", orderIndex: 23, title: "Berdisko di Jakarta", level: "B1", description: "" },
  { id: "77859172-c910-43a1-a94b-c8d6c1dabf1d", orderIndex: 24, title: "Surat dari Indonesia", level: "B2", description: "" },
  { id: "520cdf0d-069e-4dc5-ba31-0ac2ce958095", orderIndex: 25, title: "Ambon sebagai obyek pariwisata", level: "B2", description: "" },
  { id: "22e6a963-4ebd-4b57-8fc4-ac644ac0576e", orderIndex: 26, title: "Musim Hujan", level: "B1", description: "" },
  { id: "ba8f4ebe-b157-44cc-8248-98171183315c", orderIndex: 27, title: "Bab 11 - Sewa Rumah", level: "B1", description: "" },
  { id: "0a64adaa-e785-4113-a0ce-393a6777dacb", orderIndex: 28, title: "Bab 12 - Di Kantor", level: "B1", description: "" },
  { id: "53869c8c-8035-45b4-a859-2e4f77e8ca80", orderIndex: 29, title: "Bab 13 - Internet di Indonesia", level: "B2", description: "" },
  { id: "64f62c89-b2ab-4275-93cc-86b8637d828e", orderIndex: 30, title: "Bab 14 - Musik Pop di Indonesia", level: "B2", description: "" },
]
