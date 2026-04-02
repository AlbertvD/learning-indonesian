# Lesson Audio Integration & Section Reordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move lesson audio from the `podcasts` table to the `lessons` table and ensure the "Grammar" section is displayed first on the lesson page.

**Architecture:**
1.  **Database Migration:** Add audio columns to the `lessons` table using `ALTER TABLE` (the table already exists in the live DB — `CREATE TABLE IF NOT EXISTS` changes are a no-op).
2.  **Data Seeding:** Update seeding scripts and data files to link audio metadata directly to lessons. Remove the old lesson podcast rows from the DB explicitly before re-seeding.
3.  **UI Refactoring:** Update `Lesson.tsx` to remove the podcast dependency and reorder sections so "Grammar" is first. Audio player position is already correct (between progress bar and content) — no move needed.

**Tech Stack:** React 19, TypeScript, Supabase, Mantine UI v8, Bun.

---

### Task 1: Database Migration

**Files:**
- Modify: `scripts/migration.sql` (Append `ALTER TABLE` statements — do NOT change the existing `CREATE TABLE` block)

- [ ] **Step 1: Append `ALTER TABLE` statements to `scripts/migration.sql`**
    *   Add the following at the end of the file (after all `CREATE TABLE` and policy statements):
    ```sql
    ALTER TABLE indonesian.lessons ADD COLUMN IF NOT EXISTS audio_path text;
    ALTER TABLE indonesian.lessons ADD COLUMN IF NOT EXISTS duration_seconds integer;
    ALTER TABLE indonesian.lessons ADD COLUMN IF NOT EXISTS transcript_dutch text;
    ALTER TABLE indonesian.lessons ADD COLUMN IF NOT EXISTS transcript_indonesian text;
    ALTER TABLE indonesian.lessons ADD COLUMN IF NOT EXISTS transcript_english text;
    ```
    *   Do NOT modify the existing `CREATE TABLE IF NOT EXISTS indonesian.lessons` block — that would only affect fresh installs, not the live DB.

- [ ] **Step 2: Run the migration**
    *   Run: `make migrate SUPABASE_SERVICE_KEY=<key>`
    *   Expected: Database schema updated — five new nullable columns on `indonesian.lessons`.

- [ ] **Step 3: Commit migration changes**
    *   `git add scripts/migration.sql`
    *   `git commit -m "db: add audio columns to lessons table"`

---

### Task 2: Data Refactoring (Lessons)

**Files:**
- Modify: `scripts/data/lessons.ts` (Move audio metadata here)
- Modify: `scripts/seed-lessons.ts` (Handle new columns during seeding)

- [ ] **Step 1: Update `LessonData` interface and content in `scripts/data/lessons.ts`**
    *   Add optional fields to the interface: `audio_filename`, `duration_seconds`, `transcript_dutch`, `transcript_indonesian`, `transcript_english`.
    *   `audio_filename` is the local filename (e.g. `lesson-1.mp3`) — the seeder will prepend `lessons/` to form the `audio_path` stored in the DB (matching the `indonesian-lessons` storage bucket layout).
    *   Populate these fields for Les 1, 2, 3 by copying the values from `scripts/data/podcasts.ts`.

- [ ] **Step 2: Update `seed-lessons.ts` to include new columns in the `upsert` call**
    *   Map `audio_filename` → `audio_path` (e.g. `lessons/${lesson.audio_filename}`) during the upsert.
    *   Include `duration_seconds`, `transcript_dutch`, `transcript_indonesian`, `transcript_english` directly.

- [ ] **Step 3: Run the lesson seeder**
    *   Run: `bun run scripts/seed-lessons.ts` (or `make seed-lessons SUPABASE_SERVICE_KEY=<key>`)
    *   Expected: Lesson rows in the DB now have audio data populated.

- [ ] **Step 4: Commit lesson data changes**
    *   `git add scripts/data/lessons.ts scripts/seed-lessons.ts`
    *   `git commit -m "data: link audio metadata to lessons"`

---

### Task 3: Data Refactoring (Podcasts)

**Files:**
- Modify: `scripts/data/podcasts.ts` (Remove lesson-related audio)

> **Important:** Removing entries from `podcasts.ts` and re-running the seeder does NOT delete existing rows — the seeder only upserts. The old lesson podcast rows must be explicitly deleted from the DB first.

- [ ] **Step 1: Delete the old lesson podcast rows from the DB**
    *   Run directly against Supabase (via `psql` or the Supabase Studio SQL editor):
    ```sql
    DELETE FROM indonesian.podcasts WHERE title ILIKE 'Les %';
    ```
    *   Verify: `SELECT title FROM indonesian.podcasts;` should no longer show Les 1, 2, 3 entries.

- [ ] **Step 2: Remove lesson-specific audio entries (Les 1, 2, 3) from `scripts/data/podcasts.ts`**

- [ ] **Step 3: Run the podcast seeder to confirm clean state**
    *   Run: `make seed-podcasts SUPABASE_SERVICE_KEY=<key>`
    *   Expected: `podcasts` table contains only non-lesson podcast entries.

- [ ] **Step 4: Commit podcast data changes**
    *   `git add scripts/data/podcasts.ts`
    *   `git commit -m "data: remove lesson audio from podcasts table"`

---

### Task 4: Service & Interface Updates

**Files:**
- Modify: `src/services/lessonService.ts` (Update `Lesson` interface, queries, and add audio URL helper)
- Modify: `src/services/podcastService.ts` (Remove `getPodcastForLesson`; keep `getAudioUrl` or move it)

- [ ] **Step 1: Update `Lesson` interface in `src/services/lessonService.ts`**
    *   Add optional audio fields: `audio_path`, `duration_seconds`, `transcript_dutch`, `transcript_indonesian`, `transcript_english`.

- [ ] **Step 2: Update `getLesson` and `getLessons` queries to select the new columns**
    *   The existing `select('*, lesson_sections(*)')` already selects all columns — no query change needed unless you want to be explicit.

- [ ] **Step 3: Add `getAudioUrl` to `lessonService`**
    *   Move or duplicate the URL helper so it reads from the `indonesian-lessons` storage bucket (not `indonesian-podcasts`):
    ```typescript
    getAudioUrl(audioPath: string): string {
      const { data } = supabase.storage
        .from('indonesian-lessons')
        .getPublicUrl(audioPath)
      return data.publicUrl
    }
    ```

- [ ] **Step 4: Remove `getPodcastForLesson` from `src/services/podcastService.ts`**
    *   Also remove `getAudioUrl` from `podcastService` only after `Lesson.tsx` has been updated to use `lessonService.getAudioUrl` (Task 5). Do this in the same commit as Task 5 to avoid a broken intermediate state.

- [ ] **Step 5: Commit service changes (together with Task 5 UI changes)**
    *   See Task 5, Step 5.

---

### Task 5: UI Refactoring (`Lesson.tsx`)

**Files:**
- Modify: `src/pages/Lesson.tsx`

> **Note:** The audio player is already positioned between the progress bar and the lesson content — no positional change is needed. The work here is removing the podcast dependency and fixing section reordering.

- [ ] **Step 1: Update `fetchData` in `Lesson.tsx`**
    *   Remove the `podcast` state variable and the `podcastService.getPodcastForLesson` call.
    *   Remove the `podcastService` import.
    *   Derive the audio URL directly from the lesson object: `lesson.audio_path ? lessonService.getAudioUrl(lesson.audio_path) : null`.

- [ ] **Step 2: Update the audio player render block**
    *   Replace `podcast.title` with `lesson.title` (or a suitable label) in the player UI.
    *   Replace `podcastService.getAudioUrl(podcast.audio_path)` with `lessonService.getAudioUrl(lesson.audio_path)`.

- [ ] **Step 3: Implement "Grammar First" reordering logic**
    *   After fetching the lesson, reorder `lesson.lesson_sections` so that any section whose `content.type === 'grammar'` is moved to the front. Note: `type` is a field inside the `content` jsonb object, not a top-level field on the section.
    ```typescript
    const sections = [...lessonData.lesson_sections].sort((a, b) => {
      const aIsGrammar = (a.content as { type?: string }).type === 'grammar' ? -1 : 0
      const bIsGrammar = (b.content as { type?: string }).type === 'grammar' ? -1 : 0
      return aIsGrammar - bIsGrammar
    })
    setLesson({ ...lessonData, lesson_sections: sections })
    ```

- [ ] **Step 4: Verify the changes**
    *   Run: `bun run dev` and navigate to a lesson.
    *   Expected: Audio player visible (when lesson has audio), Grammar section is the first one shown.

- [ ] **Step 5: Commit UI + service cleanup together**
    *   `git add src/pages/Lesson.tsx src/services/lessonService.ts src/services/podcastService.ts`
    *   `git commit -m "feat: move lesson audio to lessons table, grammar section first"`

---

### Task 6: Testing & Validation

**Files:**
- Create: `src/__tests__/lessonAudio.test.ts` (Verify logic)

- [ ] **Step 1: Write a test for the "Grammar First" reordering logic**
    *   Test that a lesson whose sections have grammar at index 1 is correctly reordered so grammar appears at index 0.
    *   The test must check `(section.content as { type?: string }).type === 'grammar'` — not `section.type`.

- [ ] **Step 2: Run the tests**
    *   Run: `bun run test`
    *   Expected: All tests pass.

- [ ] **Step 3: Commit tests**
    *   `git add src/__tests__/lessonAudio.test.ts`
    *   `git commit -m "test: add verification for grammar-first section reordering"`
