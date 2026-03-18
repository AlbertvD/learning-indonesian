# UI Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add NL/EN language switching, collapsible sidebar, consistent header profile, dark/light mode toggle, and seed public flashcard decks from lesson vocabulary.

**Architecture:** Language preference is stored in `indonesian.profiles` and loaded into `authStore`. A typed `useT()` hook returns the right translation object. The sidebar uses Mantine AppShell's built-in two-disclosure pattern. Dark/light mode uses Mantine's `localStorageColorSchemeManager`. Flashcard decks are seeded as public card sets owned by the admin user.

**Tech Stack:** React 19, Mantine UI v8, Zustand 5, Supabase JS v2, Bun, Vitest + RTL

---

### Task 1: Add `language` column to profiles — DB migration

**Files:**
- Modify: `scripts/migrate.ts`

**Step 1: Add `language` column to `migrate.ts`**

In `scripts/migrate.ts`, find the profiles table definition and add the `language` column:

```typescript
CREATE TABLE IF NOT EXISTS indonesian.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  language text NOT NULL DEFAULT 'nl' CHECK (language IN ('nl', 'en')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Step 2: Run migration in Supabase Studio**

Paste this into Supabase Studio → SQL Editor and run:

```sql
ALTER TABLE indonesian.profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'nl'
  CHECK (language IN ('nl', 'en'));
```

**Step 3: Verify in Studio**

Check that `SELECT language FROM indonesian.profiles LIMIT 1;` returns `nl`.

**Step 4: Commit**

```bash
git add scripts/migrate.ts
git commit -m "feat: add language preference column to profiles"
```

---

### Task 2: Enhance `authStore` — fetch display_name + language from profiles

**Files:**
- Modify: `src/stores/authStore.ts`
- Modify: `src/types/auth.ts`

**Prerequisite:** `create<AuthState>((set, get) => ...)` — add `get` as the second parameter before writing any of the steps below. Without it, `updateDisplayName` and `updateLanguage` will fail at runtime.

**Step 1: Update `UserProfile` type**

```typescript
// src/types/auth.ts
export interface UserProfile {
  id: string
  email: string
  fullName: string | null       // from indonesian.profiles.display_name
  language: 'nl' | 'en'        // from indonesian.profiles.language
  isAdmin: boolean
}
```

**Step 2: Add `updateDisplayName` and `updateLanguage` actions to the store interface**

```typescript
interface AuthState {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
  updateDisplayName: (name: string) => Promise<void>
  updateLanguage: (lang: 'nl' | 'en') => Promise<void>
}
```

**Step 3: Replace `toProfile` and fix the `onAuthStateChange` upsert bug**

The current upsert overwrites `display_name` on every login. Fix with `ignoreDuplicates: true` (insert-only for existing users), then READ the actual values back.

Extract a helper to load profile data:

```typescript
async function loadProfileData(userId: string): Promise<{ displayName: string | null; language: 'nl' | 'en' }> {
  const { data } = await supabase
    .schema('indonesian')
    .from('profiles')
    .select('display_name, language')
    .eq('id', userId)
    .maybeSingle() // .single() throws PGRST116 on zero rows; .maybeSingle() returns null data with no error
  return {
    displayName: data?.display_name ?? null,
    language: (data?.language as 'nl' | 'en') ?? 'nl',
  }
}
```

Update `toProfile` to accept displayName and language:

```typescript
function toProfile(user: User, isAdmin: boolean, displayName: string | null, language: 'nl' | 'en'): UserProfile {
  return {
    id: user.id,
    email: user.email!,
    fullName: displayName,
    language,
    isAdmin,
  }
}
```

Update `onAuthStateChange` callback:

```typescript
setTimeout(async () => {
  // Insert only — do NOT overwrite existing display_name or language
  await supabase
    .schema('indonesian')
    .from('profiles')
    .upsert(
      { id: session.user!.id, display_name: session.user!.user_metadata?.full_name ?? null },
      { onConflict: 'id', ignoreDuplicates: true }
      // ignoreDuplicates: true → ON CONFLICT DO NOTHING
      // If a row with this id already exists, the ENTIRE upsert payload is ignored —
      // both display_name and language remain exactly as the user last set them.
      // Removing this flag would silently revert both fields to GoTrue values on every token refresh.
    )
  const [{ displayName, language }, isAdmin] = await Promise.all([
    loadProfileData(session.user!.id),
    checkAdmin(session.user!.id),
  ])
  set({ user: session.user, profile: toProfile(session.user!, isAdmin, displayName, language) })
}, 0)
```

Also update the `initialize` function's session block to call `loadProfileData` before `set()`:

```typescript
initialize: async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    const [{ displayName, language }, isAdmin] = await Promise.all([
      loadProfileData(session.user.id),
      checkAdmin(session.user.id),
    ])
    set({ user: session.user, profile: toProfile(session.user, isAdmin, displayName, language), loading: false })
  } else {
    set({ loading: false })
  }
},
```

**Step 4: Add `updateDisplayName` and `updateLanguage` actions**

```typescript
updateDisplayName: async (name) => {
  const user = get().user
  if (!user) return
  const { error } = await supabase
    .schema('indonesian')
    .from('profiles')
    .upsert({ id: user.id, display_name: name.trim() || null, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (error) throw error
  set((state) => ({
    profile: state.profile ? { ...state.profile, fullName: name.trim() || null } : null,
  }))
},

updateLanguage: async (lang) => {
  const user = get().user
  if (!user) return
  const { error } = await supabase
    .schema('indonesian')
    .from('profiles')
    .upsert({ id: user.id, language: lang, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (error) throw error
  set((state) => ({
    profile: state.profile ? { ...state.profile, language: lang } : null,
  }))
},
```

**Step 5: Update `Profile.tsx` to use `authStore.updateDisplayName`**

In `src/pages/Profile.tsx`, replace the direct Supabase call in `handleSave` with:

```typescript
const updateDisplayName = useAuthStore((state) => state.updateDisplayName)

async function handleSave() {
  if (!user) return
  setSaving(true)
  try {
    await updateDisplayName(displayName)
    notifications.show({ color: 'green', title: 'Profile updated', message: 'Your display name has been saved.' })
  } catch (err) {
    logError({ page: 'profile', action: 'saveDisplayName', error: err })
    notifications.show({ color: 'red', title: 'Failed to save profile', message: 'Something went wrong. Please try again.' })
  } finally {
    setSaving(false)
  }
}
```

Also remove the separate `profileRow` fetch in the `useEffect` — use `profile?.fullName` directly as initial state:

```typescript
useEffect(() => {
  async function fetchData() {
    if (!user) return
    try {
      const userProgress = await progressService.getUserProgress(user.id)
      setProgress(userProgress)
      setDisplayName(profile?.fullName ?? '')
    } catch (err) {
      // ...
    } finally {
      setLoading(false)
    }
  }
  fetchData()
}, [user, profile])
```

**Step 6: Update the existing breaking test and write the new test**

The existing `'initialize sets user if session exists'` test at `src/__tests__/authStore.test.ts` will fail after Task 2 because:
1. `initialize` now calls `loadProfileData` which chains into the Supabase mock — the mock must be set up to return profile data
2. `profile` now includes `language: 'nl'` but the `toEqual` assertion doesn't expect it

Update that test:
```typescript
// Add to existing mock setup before calling initialize().
// initialize() calls both loadProfileData and checkAdmin via Promise.all — both use .maybeSingle().
// Queue both in order (Promise.all resolves left-to-right):
vi.mocked((supabase as any).maybeSingle).mockResolvedValueOnce({
  data: { display_name: 'Test User', language: 'nl' },
  error: null,
})
// Second maybeSingle: checkAdmin (falls through to beforeEach default if not queued, but explicit is safer)
vi.mocked((supabase as any).maybeSingle).mockResolvedValueOnce({ data: null })

// Update the toEqual assertion to include language:
expect(useAuthStore.getState().profile).toEqual({
  id: 'user-1',
  email: 'test@example.com',
  fullName: 'Test User',
  language: 'nl',
  isAdmin: false,
})
```

Also add the new test for `updateDisplayName`:
```typescript
// src/__tests__/authStore.test.ts — add to existing test file
it('updateDisplayName updates profile in store', async () => {
  // vi.mocked(supabase.upsert) applies globally — the flat mock covers all tables on the mock object
  vi.mocked(supabase.upsert).mockResolvedValue({ error: null })
  // set up initial state with a user and profile
  // call updateDisplayName('Albert')
  // assert profile.fullName === 'Albert'
})
```

**Step 7: Run tests**

```bash
bun run test
```

Expected: all tests pass.

**Step 8: Commit**

```bash
git add src/stores/authStore.ts src/types/auth.ts src/pages/Profile.tsx
git commit -m "feat: fetch display_name and language from profiles, add update actions"
```

---

### Task 3: Create translations file and `useT` hook

**Files:**
- Create: `src/lib/i18n.ts`
- Create: `src/hooks/useT.ts`

**Step 1: Create `src/lib/i18n.ts`**

```typescript
// src/lib/i18n.ts
export type Lang = 'nl' | 'en'

export const nl = {
  nav: {
    lessons: 'Lessen',
    podcasts: 'Podcasts',
    flashcards: 'Flashkaarten',
    leaderboard: 'Ranglijst',
    profile: 'Profiel',
    logout: 'Uitloggen',
    settings: 'Instellingen',
  },
  dashboard: {
    welcomeBack: 'Welkom terug',
    overview: 'Hier is een overzicht van je voortgang.',
    lessonsCompleted: 'Lessen afgerond',
    cardsDue: 'Kaarten te herhalen',
    reviewNow: 'Nu herhalen',
    level: 'Niveau',
    quickActions: 'Snelle acties',
    continueLearning: 'Doorgaan met leren',
    reviewCards: 'Kaarten herhalen',
    browsePodcasts: 'Podcasts bekijken',
  },
  profile: {
    title: 'Profiel',
    account: 'Account',
    email: 'E-mail',
    memberSince: 'Lid sinds',
    level: 'Niveau',
    displayName: 'Weergavenaam',
    displayNamePlaceholder: 'Voer je weergavenaam in',
    save: 'Opslaan',
    language: 'Taal',
    dutch: 'Nederlands',
    english: 'Engels',
    profileUpdated: 'Profiel bijgewerkt',
    displayNameSaved: 'Je weergavenaam is opgeslagen.',
    languageSaved: 'Je taalvoorkeur is opgeslagen.',
    failedToLoad: 'Laden mislukt',
    failedToSave: 'Opslaan mislukt',
    somethingWentWrong: 'Er ging iets mis. Probeer het opnieuw.',
  },
  register: {
    title: 'Account aanmaken',
    alreadyHaveAccount: 'Heb je al een account?',
    logIn: 'Inloggen',
    fullName: 'Volledige naam',
    fullNamePlaceholder: 'Jan de Vries',
    email: 'E-mail',
    emailPlaceholder: 'jij@voorbeeld.com',
    password: 'Wachtwoord',
    passwordPlaceholder: 'Je wachtwoord',
    createAccount: 'Account aanmaken',
    registrationSuccess: 'Registratie geslaagd',
    accountCreated: 'Je account is aangemaakt. Je kunt nu inloggen.',
    registrationFailed: 'Registratie mislukt',
    somethingWentWrong: 'Er ging iets mis. Probeer het opnieuw.',
  },
  login: {
    title: 'Welkom terug',
    noAccount: 'Heb je nog geen account?',
    createOne: 'Maak er een aan',
    email: 'E-mail',
    emailPlaceholder: 'jij@voorbeeld.com',
    password: 'Wachtwoord',
    passwordPlaceholder: 'Je wachtwoord',
    logIn: 'Inloggen',
    loginFailed: 'Inloggen mislukt',
    incorrectCredentials: 'Onjuist e-mailadres of wachtwoord.',
    somethingWentWrong: 'Er ging iets mis. Probeer het opnieuw.',
  },
  lessons: {
    title: 'Lessen',
    backToList: 'Terug naar overzicht',
    section: 'Sectie',
    of: 'van',
    previous: 'Vorige',
    nextSection: 'Volgende sectie',
    finishLesson: 'Les afronden',
    lessonComplete: 'Les afgerond!',
    lessonCompleteMessage: (title: string) => `Je hebt ${title} afgerond`, // Note: function in translation object — call as T.lessons.lessonCompleteMessage(title), not via generic tooling
    failedToLoad: 'Laden mislukt',
    failedToLoadLesson: 'De les kon niet worden geladen.',
    failedToSaveProgress: 'Voortgang kon niet worden opgeslagen. Probeer het opnieuw.',
  },
  common: {
    loading: 'Laden...',
    error: 'Fout',
    somethingWentWrong: 'Er ging iets mis. Probeer het opnieuw.',
  },
}

export const en: typeof nl = {
  nav: {
    lessons: 'Lessons',
    podcasts: 'Podcasts',
    flashcards: 'Flashcards',
    leaderboard: 'Leaderboard',
    profile: 'Profile',
    logout: 'Logout',
    settings: 'Settings',
  },
  dashboard: {
    welcomeBack: 'Welcome back',
    overview: "Here's your learning overview.",
    lessonsCompleted: 'Lessons Completed',
    cardsDue: 'Cards Due',
    reviewNow: 'Review now',
    level: 'Level',
    quickActions: 'Quick Actions',
    continueLearning: 'Continue Learning',
    reviewCards: 'Review Cards',
    browsePodcasts: 'Browse Podcasts',
  },
  profile: {
    title: 'Profile',
    account: 'Account',
    email: 'Email',
    memberSince: 'Member since',
    level: 'Level',
    displayName: 'Display name',
    displayNamePlaceholder: 'Enter your display name',
    save: 'Save',
    language: 'Language',
    dutch: 'Dutch',
    english: 'English',
    profileUpdated: 'Profile updated',
    displayNameSaved: 'Your display name has been saved.',
    languageSaved: 'Your language preference has been saved.',
    failedToLoad: 'Failed to load profile',
    failedToSave: 'Failed to save profile',
    somethingWentWrong: 'Something went wrong. Please try again.',
  },
  register: {
    title: 'Create account',
    alreadyHaveAccount: 'Already have an account?',
    logIn: 'Log in',
    fullName: 'Full Name',
    fullNamePlaceholder: 'John Doe',
    email: 'Email',
    emailPlaceholder: 'you@example.com',
    password: 'Password',
    passwordPlaceholder: 'Your password',
    createAccount: 'Create account',
    registrationSuccess: 'Registration successful',
    accountCreated: 'Your account has been created. You can now log in.',
    registrationFailed: 'Registration failed',
    somethingWentWrong: 'Something went wrong. Please try again.',
  },
  login: {
    title: 'Welcome back',
    noAccount: "Don't have an account?",
    createOne: 'Create one',
    email: 'Email',
    emailPlaceholder: 'you@example.com',
    password: 'Password',
    passwordPlaceholder: 'Your password',
    logIn: 'Log in',
    loginFailed: 'Login failed',
    incorrectCredentials: 'Incorrect email or password.',
    somethingWentWrong: 'Something went wrong. Please try again.',
  },
  lessons: {
    title: 'Lessons',
    backToList: 'Back to list',
    section: 'Section',
    of: 'of',
    previous: 'Previous',
    nextSection: 'Next Section',
    finishLesson: 'Finish Lesson',
    lessonComplete: 'Lesson complete!',
    lessonCompleteMessage: (title: string) => `You've finished ${title}`,
    failedToLoad: 'Failed to load',
    failedToLoadLesson: 'Failed to load lesson.',
    failedToSaveProgress: 'Failed to save your progress. Please try again.',
  },
  common: {
    loading: 'Loading...',
    error: 'Error',
    somethingWentWrong: 'Something went wrong. Please try again.',
  },
}

export const translations: Record<Lang, typeof nl> = { nl, en }
```

**Step 2: Create `src/hooks/useT.ts`**

```typescript
// src/hooks/useT.ts
import { useAuthStore } from '@/stores/authStore'
import { translations } from '@/lib/i18n'

export function useT() {
  const lang = useAuthStore((state) => state.profile?.language ?? 'nl')
  return translations[lang]
}
```

**Step 3: Commit**

```bash
git add src/lib/i18n.ts src/hooks/useT.ts
git commit -m "feat: add NL/EN translations and useT hook"
```

---

### Task 4: Apply translations to key pages

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/Login.tsx`
- Modify: `src/pages/Register.tsx`
- Modify: `src/pages/Lesson.tsx`

**Step 1: Update `Dashboard.tsx`**

Add `const T = useT()` and replace all hardcoded strings:

- `"Selamat datang!"` → conditional: `profile?.fullName ? \`${T.dashboard.welcomeBack}, ${profile.fullName.split(' ')[0]}!\` : \`${T.dashboard.welcomeBack}!\`` (avoids `"Welkom terug, !"` when name is null)
- `"Welcome back. Here's your learning overview."` → `T.dashboard.overview`
- `"Lessons Completed"` → `T.dashboard.lessonsCompleted`
- `"Cards Due"` → `T.dashboard.cardsDue`
- `"Review now"` → `T.dashboard.reviewNow`
- `"Level"` → `T.dashboard.level`
- `"Quick Actions"` → `T.dashboard.quickActions`
- `"Continue Learning"` → `T.dashboard.continueLearning`
- `"Review Cards"` → `T.dashboard.reviewCards`
- `"Browse Podcasts"` → `T.dashboard.browsePodcasts`
- Remove the Supabase Studio `<Button>` entirely (admins should bookmark https://db.supabase.duin.home directly)
- In the `catch` block, replace hardcoded error notification strings with `T.common.somethingWentWrong` (the key already exists in the translations object)

**Step 2: Update `Login.tsx`**

Add `const T = useT()` and replace hardcoded strings using `T.login.*`.

Note: `useT()` reads from `authStore.profile?.language`. On the login page the user isn't logged in, so `profile` is null and `useT()` returns `nl` (the default). That's correct behaviour.

**Step 3: Update `Register.tsx`**

Add `const T = useT()` and replace hardcoded strings using `T.register.*`. Note: like Login, unauthenticated users will always see Dutch here — `profile` is null so `useT()` returns `'nl'`. This is intentional; do not add a localStorage fallback.

**Step 4: Update `Lesson.tsx`**

Replace: `"Back to list"`, `"Section X of Y"`, `"Previous"`, `"Next Section"`, `"Finish Lesson"`, error messages using `T.lessons.*`.

**Step 5: Run tests**

```bash
bun run test
```

Expected: all 27 tests pass (tests mock the store so language doesn't affect them).

**Step 6: Commit**

```bash
git add src/pages/Dashboard.tsx src/pages/Login.tsx src/pages/Register.tsx src/pages/Lesson.tsx
git commit -m "feat: apply translations to Dashboard, Login, Register, Lesson pages"
```

**Scope note:** Flashcards, Leaderboard, and Podcasts pages are intentionally left with hardcoded English strings in this plan. They will respond partially to the language switcher (nav labels switch), but their page content will not. This is acceptable for now — document it as a follow-up task if needed.

---

### Task 5: Language switcher in Profile page

**Files:**
- Modify: `src/pages/Profile.tsx`

**Step 1: Add language switcher section**

Add after the Display Name paper:

```typescript
const updateLanguage = useAuthStore((state) => state.updateLanguage)
const [savingLang, setSavingLang] = useState(false)

async function handleLanguageChange(lang: 'nl' | 'en') {
  setSavingLang(true)
  try {
    await updateLanguage(lang)
    notifications.show({ color: 'green', title: T.profile.profileUpdated, message: T.profile.languageSaved })
  } catch (err) {
    logError({ page: 'profile', action: 'updateLanguage', error: err })
    notifications.show({ color: 'red', title: T.profile.failedToSave, message: T.profile.somethingWentWrong })
  } finally {
    setSavingLang(false)
  }
}
```

Add a paper section below the display name one:

```tsx
<Paper withBorder p="xl" radius="md" shadow="sm">
  <Stack gap="md">
    <Title order={4}>{T.profile.language}</Title>
    <SegmentedControl
      value={profile?.language ?? 'nl'}
      onChange={(val) => handleLanguageChange(val as 'nl' | 'en')}
      disabled={savingLang}
      data={[
        { label: T.profile.dutch, value: 'nl' },
        { label: T.profile.english, value: 'en' },
      ]}
    />
  </Stack>
</Paper>
```

Import `SegmentedControl` from `@mantine/core`.

**Step 2: Apply `useT` to Profile page**

Add `const T = useT()` and replace `"Profile"`, `"Account"`, `"Email"`, `"Member since"`, `"Level"`, `"Display Name"`, `"Save"` with `T.profile.*`.

**Step 3: Run tests and commit**

```bash
bun run test
git add src/pages/Profile.tsx
git commit -m "feat: add language switcher to profile page"
```

---

### Task 6: Light/dark mode toggle in header

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/components/Layout.tsx`

**Step 1: Add `localStorageColorSchemeManager` to `main.tsx`**

```typescript
import { MantineProvider, createTheme, localStorageColorSchemeManager } from '@mantine/core'

const colorSchemeManager = localStorageColorSchemeManager({ key: 'indonesian-color-scheme' })

// In JSX:
<MantineProvider theme={theme} colorSchemeManager={colorSchemeManager} defaultColorScheme="dark">
```

Remove the old `defaultColorScheme="dark"` prop (it's replaced by `colorSchemeManager` + `defaultColorScheme`).

**Step 2: Add toggle button in `Layout.tsx` header**

Import:
```typescript
import { useMantineColorScheme } from '@mantine/core'
import { IconSun, IconMoon } from '@tabler/icons-react'
```

Inside `Layout`:
```typescript
const { colorScheme, toggleColorScheme } = useMantineColorScheme()
```

Add `<ActionIcon>` button to the right-side `<Group>` in the header, left of the profile menu:

```tsx
<Group gap="xs">
  <ActionIcon
    variant="subtle"
    onClick={toggleColorScheme}
    aria-label="Toggle color scheme"
    size="lg"
  >
    {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
  </ActionIcon>
  {/* ... existing profile menu ... */}
</Group>
```

Import `ActionIcon` from `@mantine/core`.

**Step 3: Commit**

```bash
git add src/main.tsx src/components/Layout.tsx
git commit -m "feat: add light/dark mode toggle to header"
```

---

### Task 7: Redesign header and sidebar navigation

**Depends on Task 6.** Task 6 adds `useMantineColorScheme`, `toggleColorScheme`, `colorScheme`, `IconSun`, `IconMoon`, and `ActionIcon` to `Layout.tsx`. Task 7 replaces the entire header — the code snippets below already include the dark/light toggle from Task 6. Do **not** re-apply Task 6 changes separately after completing Task 7; doing so would duplicate the imports and toggle button.

**Files:**
- Modify: `src/components/Layout.tsx`

This is the most significant UI change. The nav links move from the header to the sidebar. The sidebar is collapsible on both mobile and desktop, starts open on desktop.

**Step 1: Replace single `opened` disclosure with two disclosures**

```typescript
import { useDisclosure } from '@mantine/hooks'

const [mobileOpened, { toggle: toggleMobile }] = useDisclosure(false)
const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true) // open by default on desktop
```

**Step 2: Update AppShell config**

```tsx
<AppShell
  header={{ height: 60 }}
  navbar={{
    width: 250,
    breakpoint: 'sm',
    collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
  }}
  padding="md"
>
```

**Step 3: Rewrite the header**

Remove the `<Group visibleFrom="sm">` nav links block entirely. The header becomes:

```tsx
<AppShell.Header>
  <Group h="100%" px="md" justify="space-between">
    <Group>
      {/* Mobile burger */}
      <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
      {/* Desktop burger */}
      <Burger opened={desktopOpened} onClick={toggleDesktop} visibleFrom="sm" size="sm" />
      <Text
        component={Link}
        to="/"
        size="xl"
        fw={700}
        variant="gradient"
        gradient={{ from: 'blue', to: 'cyan', deg: 90 }}
        style={{ textDecoration: 'none' }}
      >
        Indonesian
      </Text>
    </Group>

    <Group gap="xs">
      {/* Dark/light toggle (from Task 6) */}
      <ActionIcon variant="subtle" onClick={toggleColorScheme} size="lg">
        {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
      </ActionIcon>

      {/* Profile menu */}
      {profile ? (
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <UnstyledButton>
              <Group gap={7}>
                <Avatar color="blue" radius="xl" size={30}>
                  {/* Intentionally keep initials from current code, not <IconUser> — initials degrade gracefully when fullName is null (falls back to first char of email) */}
                  {profile.fullName?.[0]?.toUpperCase() ?? profile.email[0].toUpperCase()}
                </Avatar>
                <Text fw={500} size="sm" mr={3} visibleFrom="xs">
                  {profile.fullName?.split(' ')[0] ?? profile.email}
                </Text>
                <IconChevronDown size={12} stroke={1.5} />
              </Group>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{T.nav.settings}</Menu.Label>
            <Menu.Item component={Link} to="/profile" leftSection={<IconUser size={14} />}>
              {T.nav.profile}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconLogout size={14} />} onClick={handleLogout}>
              {T.nav.logout}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      ) : (
        <Button component={Link} to="/login" variant="light">
          Log in
        </Button>
      )}
    </Group>
  </Group>
</AppShell.Header>
```

**Step 4: Update the navbar (sidebar)**

```tsx
<AppShell.Navbar p="md">
  <Stack gap="xs">
    {navLinks.map((link) => (
      <Button
        key={link.path}
        component={Link}
        to={link.path}
        variant="subtle"
        leftSection={link.icon}
        onClick={() => {
          if (mobileOpened) toggleMobile() // only close if currently open; avoids accidentally opening it
        }}
        fullWidth
        justify="flex-start"
      >
        {link.label}
      </Button>
    ))}
  </Stack>
</AppShell.Navbar>
```

Note: on mobile, clicking a nav link closes the drawer. On desktop, `mobileOpened` is always false so the guard prevents any toggle.

**Step 5: Update nav labels to use `T.nav.*`**

```typescript
const navLinks = [
  { label: T.nav.lessons, icon: <IconBook size={18} />, path: '/lessons' },
  { label: T.nav.podcasts, icon: <IconHeadphones size={18} />, path: '/podcasts' },
  { label: T.nav.flashcards, icon: <IconCards size={18} />, path: '/cards' },
  { label: T.nav.leaderboard, icon: <IconTrophy size={18} />, path: '/leaderboard' },
]
```

Add `const T = useT()` at the top of the component.

**Step 6: Run tests**

```bash
bun run test
```

Expected: all tests pass.

**Step 7: Commit**

```bash
git add src/components/Layout.tsx
git commit -m "feat: sidebar navigation with hamburger toggle, consistent header profile"
```

---

### Task 8: Seed public flashcard decks from vocabulary

**Files:**
- Create: `scripts/seed-flashcards.ts`
- Modify: `Makefile`

**Step 0a: Verify `card_sets` unique constraint exists**

The seed script upserts card sets on `{ onConflict: 'owner_id,name' }`. Check `scripts/migrate.ts` for `UNIQUE(owner_id, name)` on `card_sets`. If missing, run in Supabase Studio:

```sql
ALTER TABLE indonesian.card_sets
  ADD CONSTRAINT IF NOT EXISTS card_sets_owner_name_key UNIQUE (owner_id, name);
```

And add it to `scripts/migrate.ts`.

**Step 0b: Add `anki_cards` unique constraint in Supabase Studio (one-time)**

Run in SQL Editor before the first seed:

```sql
ALTER TABLE indonesian.anki_cards
  ADD CONSTRAINT anki_cards_set_front_key UNIQUE (card_set_id, front);
```

This enables safe re-seeding via upsert without destroying user review history. Also add it to `scripts/migrate.ts` so future schema recreations include it.

**Step 1: Create `scripts/seed-flashcards.ts`**

```typescript
#!/usr/bin/env bun
import { createClient } from '@supabase/supabase-js'
import { vocabulary } from './data/vocabulary'
import { lessons } from './data/lessons'

const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY is required.')
  process.exit(1)
}

const supabase = createClient('https://api.supabase.duin.home', serviceKey)

// Find the admin user to be the owner of these public card sets
const { data: adminRole, error: adminError } = await supabase
  .schema('indonesian')
  .from('user_roles')
  .select('user_id')
  .eq('role', 'admin')
  .limit(1)
  .single()

if (adminError || !adminRole) {
  console.error('No admin user found. Create an admin user first via user_roles table.')
  process.exit(1)
}
const ownerId = adminRole.user_id
console.log('Using admin user:', ownerId)

for (const lesson of lessons) {
  // Get the lesson ID from the database
  const { data: lessonRow, error: lessonError } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id')
    .eq('module_id', lesson.module_id)
    .eq('order_index', lesson.order_index)
    .single()

  if (lessonError || !lessonRow) {
    console.error(`Lesson not found: ${lesson.title}. Run seed-lessons first.`)
    continue
  }

  const setName = `${lesson.title} — Woordenschat`

  // Upsert the card set
  const { data: cardSet, error: setError } = await supabase
    .schema('indonesian')
    .from('card_sets')
    .upsert(
      {
        owner_id: ownerId,
        name: setName,
        description: `Woordenschat uit ${lesson.title}`,
        visibility: 'public',
      },
      { onConflict: 'owner_id,name' }
    )
    .select('id')
    .single()

  if (setError || !cardSet) {
    console.error('Failed to upsert card set:', setName, setError?.message)
    continue
  }
  console.log('Upserted card set:', setName)

  // Get vocabulary for this lesson
  const lessonVocab = vocabulary.filter((v) => v.lesson_order_index === lesson.order_index)

  // Upsert cards using (card_set_id, front) as the stable key.
  // This requires a UNIQUE constraint: ALTER TABLE indonesian.anki_cards ADD CONSTRAINT anki_cards_set_front_key UNIQUE (card_set_id, front);
  // Run this once in Supabase Studio before the first seed.
  // Do NOT delete+insert: that wipes card_reviews (ON DELETE CASCADE) and destroys all user SM-2 progress.
  for (const word of lessonVocab) {
    const back = word.dutch ?? word.english
    const { error: cardError } = await supabase
      .schema('indonesian')
      .from('anki_cards')
      .upsert(
        {
          card_set_id: cardSet.id,
          owner_id: ownerId,
          front: word.indonesian,
          back,
          notes: word.dutch && word.english !== word.dutch ? word.english : null,
          tags: word.tags,
        },
        { onConflict: 'card_set_id,front' }
      )
    if (cardError) {
      console.error('  Failed card:', word.indonesian, cardError.message)
    } else {
      console.log('  Upserted card:', word.indonesian, '→', back)
    }
  }
}

console.log('Done!')
```

**Step 2: Add `seed-flashcards` to Makefile**

After the `seed-podcasts` target, add:

```makefile
.PHONY: seed-flashcards
seed-flashcards: ## Seed public flashcard decks from lesson vocabulary (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-flashcards.ts
```

Do **not** add `seed-flashcards` to `seed-all`. `seed-flashcards` requires an admin user row in `indonesian.user_roles` — a prerequisite that `seed-lessons` and `seed-vocabulary` don't have. Including it in `seed-all` would cause a partial failure on fresh-database setups, silently skipping flashcards. Run it separately after admin setup:

```bash
# After seed-all and admin user creation:
make seed-flashcards SUPABASE_SERVICE_KEY=<key>
```

Update CLAUDE.md to document this two-step flow.

**Step 3: Run seed**

```bash
make seed-flashcards
```

Expected output: admin user found, 3 card sets created, cards inserted for each lesson's vocabulary.

**Step 4: Verify in app**

Navigate to `/cards` — all 3 lesson card sets should be visible as public decks.

**Step 5: Commit**

```bash
git add scripts/seed-flashcards.ts Makefile
git commit -m "feat: seed public flashcard decks from lesson vocabulary"
```

---

### Task 9: Final test pass and push

**Step 1: Run full test suite**

```bash
bun run test
```

Expected: all tests pass.

**Step 2: Run linter**

```bash
bun run lint
```

Fix any errors (warnings are OK).

**Step 3: Test manually**

- [ ] Language switcher in Profile changes app language
- [ ] Language persists after logout/login
- [ ] Sidebar opens/closes via hamburger on both mobile and desktop
- [ ] Sidebar starts open on desktop, closed on mobile
- [ ] Profile shows first name + avatar icon consistently top right
- [ ] Dark/light toggle works and persists across page reloads
- [ ] Dashboard shows "Welkom terug, [first name]!"
- [ ] Supabase Studio link is gone from Dashboard
- [ ] Flashcard decks visible in `/cards` for all users

**Step 4: Push**

```bash
git push
```
