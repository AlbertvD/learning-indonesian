# Implementation Summary - UI Improvements & i18n

**Date:** Wednesday, March 18, 2026
**Goal:** Enhance the Indonesian language tutor with multi-language support (NL/EN), a modern collapsible navigation sidebar, dark/light mode, and improved flashcard seeding.

---

## 1. Database & Schema Updates
- **Language Preference:** Added a `language` column to the `indonesian.profiles` table (`nl` or `en`).
- **Data Integrity:** Added unique constraints to `card_sets (owner_id, name)` and `anki_cards (card_set_id, front)` to allow safe, idempotent seeding without destroying user review history.
- **Migration Scripts:** Created `scripts/migrate-run.ts` for running incremental SQL updates and `scripts/check-admin.ts` for verifying user roles.

## 2. Authentication & Profile Management
- **Auth Store Enhancement:** Updated `useAuthStore` (Zustand) to:
    - Load `display_name` and `language` preferences from the database on initialization and sign-in.
    - Prevent overwriting user-modified profile data with default metadata from Supabase Auth (`ignoreDuplicates: true`).
    - Added `updateDisplayName` and `updateLanguage` actions to synchronize local state with the database.
- **Profile Page:** Added a language switcher (SegmentedControl) and integrated it with the `authStore`.

## 3. Internationalization (i18n)
- **Translation Library:** Created `src/lib/i18n.ts` containing full Dutch and English translation objects for core pages.
- **useT Hook:** Implemented a typed `useT()` hook in `src/hooks/useT.ts` that automatically returns the correct translation set based on the user's profile preference.
- **Applied Translations:** Migrated the following pages to use the translation system:
    - `Dashboard.tsx` (Welcome message, overview, statistics, quick actions)
    - `Login.tsx` & `Register.tsx` (Form labels, placeholders, and error messages)
    - `Lesson.tsx` (Navigation, progress indicators, and section content headers)
    - `Profile.tsx` (Account details, labels, and success notifications)

## 4. UI/UX Redesign
- **App Shell & Sidebar:**
    - Replaced the horizontal header navigation with a collapsible sidebar.
    - Implemented independent disclosures for mobile (starts closed) and desktop (starts open).
    - Sidebar closes automatically on mobile after navigating.
- **Theming:**
    - Integrated Mantine's `localStorageColorSchemeManager` for persistent dark/light mode.
    - Added a theme toggle button in the header with sun/moon icons.
- **Header:**
    - Simplified the header to focus on the logo, sidebar toggle, theme toggle, and a consistent profile menu.
    - Standardized the profile menu to show user initials (Avatar) and first name.

## 5. Content Seeding
- **Flashcard Seeding:** Created `scripts/seed-flashcards.ts` to automatically generate public flashcard decks from existing lesson vocabulary.
- **Makefile Integration:** Added `seed-flashcards` as a target in the `Makefile` to simplify the deployment pipeline.

## 6. Documentation & Maintenance
- **CLAUDE.md:** Updated with the new tech stack features (i18n, dark mode) and seeding instructions.
- **GEMINI.md:** Added new Makefile commands to the reference list.
- **Testing:** Updated `authStore.test.ts` to cover the new profile loading logic and `updateDisplayName` action. All 28 project tests are passing.

---

## Technical Debt Addressed
- Fixed `tsc` type errors in the test suite by casting mocked Supabase calls to `any`.
- Cleaned up unused imports (e.g., `IconDatabase`, `readFileSync`) across multiple files.
- Addressed `PGRST116` errors by switching from `.single()` to `.maybeSingle()` when fetching user profiles that may not yet exist.
