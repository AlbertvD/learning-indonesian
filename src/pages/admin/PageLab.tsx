// src/pages/admin/PageLab.tsx
// Admin-only visual review surface for page-framework primitives. Sister page
// to /admin/design-lab — that one targets exercise primitives, this one
// targets the page primitives in `src/components/page/primitives/`.
//
// Five sections:
//   1. Layout chrome      — PageContainer + PageBody + PageHeader + SectionHeading
//   2. Cards              — StatCard / ListCard / ActionCard / HeroCard / SettingsCard
//   3. Atoms              — StatusPill / EmptyState / LoadingState / PageFormLayout
//   4. Realistic compositions — Lessons-shaped, Dashboard-shaped, Settings-shaped
//   5. Seam-contract smoke test — mock Session inside a 390 × 844 phone frame
//
// The seam-contract smoke test is the most important section: it verifies that
// PageContainer fit + PageBody fit + sticky footer compose correctly inside a
// fixed viewport, which is the exact shape used by exercise sessions.
//
// Permanent tool — not deleted after the page-framework migration. Acts as
// living documentation of every primitive's prop surface and as a regression
// surface for the visual baseline (Task 46 captures 36 screenshots from here).
//
// See docs/plans/2026-04-24-page-framework-design.md §9.

import { Button, Switch, Slider, SegmentedControl } from '@mantine/core'
import {
  IconBook,
  IconHeadphones,
  IconChartBar,
  IconUser,
  IconAlertTriangle,
  IconBolt,
  IconRefresh,
  IconTarget,
  IconFlame,
  IconInbox,
  IconChevronRight,
} from '@tabler/icons-react'
import {
  PageContainer,
  PageHeader,
  SectionHeading,
  PageBody,
  StatCard,
  ListCard,
  MediaShowcaseCard,
  ActionCard,
  HeroCard,
  SettingsCard,
  StatusPill,
  EmptyState,
  LoadingState,
  PageFormLayout,
} from '@/components/page/primitives'
import { IconBuildingStore } from '@tabler/icons-react'
import { AdminGuard } from './AdminGuard'
import classes from './PageLab.module.css'

export function PageLab() {
  return (
    <AdminGuard>
      <PageContainer size="lg">
        <PageHeader
          title="Page Lab"
          subtitle="Every page primitive in isolation, in composition, and the seam-contract smoke test."
        />

        {/* ─── 1. Layout chrome ─────────────────────────────────────────── */}
        <SectionHeading>1. Layout chrome</SectionHeading>
        <div className={classes.demoGrid}>
          <div className={classes.demoBlock}>
            <p className={classes.demoLabel}>PageContainer · sizes</p>
            <p className={classes.demoNote}>
              The outer page is itself a PageContainer size=&quot;lg&quot;
              (1080 px). Other sizes: sm 480, md 720 (default), xl 1280.
              Renders a div, declares <code>@container page</code> for child
              width queries, and owns fit-mode viewport math.
            </p>
          </div>

          <div className={classes.demoBlock}>
            <p className={classes.demoLabel}>PageContainer · fit</p>
            <p className={classes.demoNote}>
              Fit mode collapses to a flex column that fills viewport height
              minus app chrome. Demonstrated in section 5 below — it only makes
              sense inside the 390 × 844 phone frame.
            </p>
          </div>

          <div className={classes.demoBlockWide}>
            <p className={classes.demoLabel}>PageBody · variant=&quot;auto&quot; (default)</p>
            <PageBody variant="auto">
              <div className={classes.demoFill}>
                Auto bodies leave children in normal block flow — the whole page
                scrolls naturally.
              </div>
            </PageBody>
          </div>

          <div className={classes.demoBlockWide}>
            <p className={classes.demoLabel}>PageHeader · with action slot</p>
            <PageHeader
              title="Pagina-titel"
              subtitle="Subtitel met dimmer styling — toelichting onder de titel."
              action={<Button size="sm" variant="light">Acteer</Button>}
            />
          </div>

          <div className={classes.demoBlockWide}>
            <p className={classes.demoLabel}>SectionHeading · with action slot</p>
            <SectionHeading
              action={<a href="#top" style={{ fontSize: 'var(--fs-sm)' }}>Bekijk alles →</a>}
            >
              Subsectie met actie
            </SectionHeading>
          </div>
        </div>

        {/* ─── 2. Cards ─────────────────────────────────────────────────── */}
        <SectionHeading>2. Cards</SectionHeading>
        <div className={classes.demoGrid}>
          <div className={classes.demoBlock}>
            <p className={classes.demoLabel}>StatCard · plain</p>
            <StatCard label="WOORDENSCHAT" value="142" />
          </div>

          <div className={classes.demoBlock}>
            <p className={classes.demoLabel}>StatCard · with trailing pill</p>
            <StatCard
              label="CONSISTENTIE"
              value="5 / 7"
              trailing={<StatusPill tone="success">Op schema</StatusPill>}
            />
          </div>

          <div className={classes.demoBlock}>
            <p className={classes.demoLabel}>StatCard · with ring slot</p>
            <StatCard
              label="HERINNERING"
              value="78%"
              ring={<div style={{ width: 60, height: 60, borderRadius: '50%', border: '6px solid var(--accent-primary)', borderRightColor: 'var(--card-border)' }} />}
              trailing={<StatusPill tone="accent">In progress</StatusPill>}
            />
          </div>

          <div className={classes.demoBlockWide}>
            <p className={classes.demoLabel}>ListCard · navigational + non-nav + custom trailing</p>
            <div className={classes.cardStack}>
              <ListCard
                icon={<IconBook size={18} />}
                title="Les 4 — Familieleden"
                subtitle="12 nieuwe woorden · 3 grammatica patronen"
                to="/lesson/4"
              />
              <ListCard
                icon={<IconHeadphones size={18} />}
                title="Podcast 2 — Op de markt"
                subtitle="14 min · transcript beschikbaar"
                to="/podcast/2"
              />
              <ListCard
                icon={<IconChartBar size={18} />}
                title="Voortgang deze week"
                subtitle="Niet aanklikbaar (geen `to` prop)"
                trailing={<StatusPill tone="warning">Risico</StatusPill>}
              />
            </div>
          </div>

          <div className={classes.demoBlockWide}>
            <p className={classes.demoLabel}>ActionCard · 3 tonen (accent / warning / danger)</p>
            <div className={classes.cardStack}>
              <ActionCard
                tone="accent"
                icon={<IconBolt size={20} />}
                title="Korte sessie"
                focus="8 oefeningen · ~5 min"
                reason="Aangeraden nu — je bent aan het opbouwen."
                to="/session"
              />
              <ActionCard
                tone="warning"
                icon={<IconRefresh size={20} />}
                title="Werk achterstand weg"
                focus="22 reviews achter"
                reason="Op basis van je herhalingsschema."
                to="/session?mode=catchup"
              />
              <ActionCard
                tone="danger"
                icon={<IconAlertTriangle size={20} />}
                title="Zwakke woorden"
                focus="6 woorden vragen aandacht"
                reason="Recall onder 60% — focus op deze items."
                to="/session"
              />
            </div>
          </div>

          <div className={classes.demoBlockWide}>
            <p className={classes.demoLabel}>HeroCard · with title</p>
            <HeroCard title="Planning van vandaag">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Reviews</div>
                  <div style={{ fontSize: 'var(--fs-3xl)', fontWeight: 'var(--fw-bold)' }}>14</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Nieuwe items</div>
                  <div style={{ fontSize: 'var(--fs-3xl)', fontWeight: 'var(--fw-bold)' }}>4</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Recall</div>
                  <div style={{ fontSize: 'var(--fs-3xl)', fontWeight: 'var(--fw-bold)' }}>6</div>
                </div>
                <Button>Doorgaan met les</Button>
              </div>
            </HeroCard>
          </div>

          <div className={classes.demoBlockWide}>
            <p className={classes.demoLabel}>MediaShowcaseCard · default + featured + disabled</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <MediaShowcaseCard
                banner={
                  <div style={{
                    width: '100%', height: '100%',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <IconBuildingStore size={56} color="rgba(255,255,255,0.9)" />
                  </div>
                }
                eyebrow="LES 1"
                title="Di Pasar"
                tags={<><StatusPill tone="neutral">Werkwoord</StatusPill><StatusPill tone="neutral">Naamwoord</StatusPill></>}
                status={<StatusPill tone="accent">In oefening</StatusPill>}
                cta="Doorgaan"
                to="/lesson/1"
              />
              <MediaShowcaseCard
                featured
                banner={
                  <div style={{
                    width: '100%', height: '100%',
                    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <IconBook size={80} color="rgba(255,255,255,0.92)" />
                  </div>
                }
                eyebrow="AANBEVOLEN"
                title="Les 6 — Jakarta"
                subtitle="Begin met de aanbevolen les en bouw rustig je woordenschat op."
                cta="Open les"
                to="/lesson/6"
              />
              <MediaShowcaseCard
                disabled
                banner={
                  <div style={{
                    width: '100%', height: '100%',
                    background: 'linear-gradient(135deg, #71717a 0%, #3f3f46 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <IconBook size={56} color="rgba(255,255,255,0.4)" />
                  </div>
                }
                eyebrow="LES 9"
                title="Ke Puskesmas"
                status={<StatusPill tone="neutral">Komt later</StatusPill>}
              />
            </div>
          </div>

          <div className={classes.demoBlockWide}>
            <p className={classes.demoLabel}>HeroCard · without title</p>
            <HeroCard>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-bold)' }}>Goed bezig — 5 dagen op rij</div>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>Houd je streak vast tot zondag</div>
                </div>
                <IconFlame size={36} color="var(--warning)" />
              </div>
            </HeroCard>
          </div>

          <div className={classes.demoBlockWide}>
            <p className={classes.demoLabel}>SettingsCard · plain + with description</p>
            <div className={classes.cardStack}>
              <SettingsCard title="Sessiegrootte">
                <Slider defaultValue={12} min={4} max={24} step={2} marks={[{ value: 4, label: '4' }, { value: 12, label: '12' }, { value: 24, label: '24' }]} />
              </SettingsCard>
              <SettingsCard
                title="Luisteroefeningen"
                description="Inschakelen om audio-MCQ en dictaat-oefeningen mee te nemen in elke sessie."
              >
                <Switch defaultChecked label="Audio-oefeningen actief" />
              </SettingsCard>
            </div>
          </div>
        </div>

        {/* ─── 3. Atoms ─────────────────────────────────────────────────── */}
        <SectionHeading>3. Atoms</SectionHeading>
        <div className={classes.demoGrid}>
          <div className={classes.demoBlockWide}>
            <p className={classes.demoLabel}>StatusPill · 5 tonen</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <StatusPill tone="success">Op schema</StatusPill>
              <StatusPill tone="warning">Risico</StatusPill>
              <StatusPill tone="danger">Gemist</StatusPill>
              <StatusPill tone="accent">In uitvoering</StatusPill>
              <StatusPill tone="neutral">Inactief</StatusPill>
            </div>
          </div>

          <div className={classes.demoBlock}>
            <p className={classes.demoLabel}>EmptyState · message-only</p>
            <EmptyState
              icon={<IconInbox size={48} />}
              message="Geen reviews vandaag — kom morgen terug."
            />
          </div>

          <div className={classes.demoBlock}>
            <p className={classes.demoLabel}>EmptyState · with CTA</p>
            <EmptyState
              icon={<IconTarget size={48} />}
              message="Je hebt nog geen wekelijkse doelen ingesteld."
              cta={<Button>Stel doel in</Button>}
            />
          </div>

          <div className={classes.demoBlock}>
            <p className={classes.demoLabel}>LoadingState · spinner only</p>
            <LoadingState />
          </div>

          <div className={classes.demoBlock}>
            <p className={classes.demoLabel}>LoadingState · with caption</p>
            <LoadingState caption="Oefeningen klaarzetten…" />
          </div>

          <div className={classes.demoBlockWide}>
            <p className={classes.demoLabel}>PageFormLayout · ingebed in een gestyleerd kader</p>
            <p className={classes.demoNote}>
              PageFormLayout is normaal de hele pagina (Login / Register). Hier
              tonen we het in een outline-block om alleen de kaartstijl en
              titel te valideren — de viewport-centering werkt pas zonder
              outer chrome.
            </p>
            <div style={{ position: 'relative', minHeight: 360, border: '1px dashed var(--card-border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
              <PageFormLayout title="Inloggen">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input type="email" placeholder="E-mailadres" style={{ padding: 12, borderRadius: 'var(--r-sm)', border: '1px solid var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }} />
                  <input type="password" placeholder="Wachtwoord" style={{ padding: 12, borderRadius: 'var(--r-sm)', border: '1px solid var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }} />
                  <Button fullWidth>Log in</Button>
                </div>
              </PageFormLayout>
            </div>
          </div>
        </div>

        {/* ─── 4. Realistic compositions ────────────────────────────────── */}
        <SectionHeading>4. Realistic compositions</SectionHeading>
        <div className={classes.compositionStack}>
          {/* ─ Lessons-shaped ─ */}
          <div className={classes.compositionFrame}>
            <p className={classes.compositionLabel}>Composition A · Lessons-shaped</p>
            <PageHeader
              title="Lessen"
              subtitle="Volg het curriculum les voor les."
            />
            <SectionHeading>Beschikbaar</SectionHeading>
            <div className={classes.cardStack}>
              <ListCard
                icon={<IconBook size={18} />}
                title="Les 1 — Begroetingen"
                subtitle="Basis · 8 woorden · 1 grammatica"
                to="/lesson/1"
              />
              <ListCard
                icon={<IconBook size={18} />}
                title="Les 2 — Getallen 1-10"
                subtitle="Basis · 12 woorden · 0 grammatica"
                to="/lesson/2"
              />
              <ListCard
                icon={<IconBook size={18} />}
                title="Les 3 — Eten en drinken"
                subtitle="Basis · 18 woorden · 1 grammatica"
                to="/lesson/3"
              />
              <ListCard
                icon={<IconBook size={18} />}
                title="Les 4 — Familieleden"
                subtitle="Basis · 12 woorden · 3 grammatica"
                to="/lesson/4"
              />
            </div>
          </div>

          {/* ─ Dashboard-shaped ─ */}
          <div className={classes.compositionFrame}>
            <p className={classes.compositionLabel}>Composition B · Dashboard-shaped</p>
            <PageHeader title="Dashboard" subtitle="Waar sta je vandaag?" />

            <SectionHeading>Vandaag</SectionHeading>
            <HeroCard title="Planning van vandaag">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Totaal</div>
                  <div style={{ fontSize: 'var(--fs-4xl)', fontWeight: 'var(--fw-bold)' }}>24</div>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>oefeningen vandaag</div>
                </div>
                <Button size="md">Doorgaan met les</Button>
              </div>
            </HeroCard>

            <SectionHeading>Statistieken deze week</SectionHeading>
            <div className={classes.statGrid}>
              <StatCard label="CONSISTENTIE" value="5 / 7" trailing={<StatusPill tone="success">Op schema</StatusPill>} />
              <StatCard label="HERINNERING" value="78%" trailing={<StatusPill tone="accent">On track</StatusPill>} />
              <StatCard label="WOORDENSCHAT" value="142" trailing={<StatusPill tone="neutral">+ 8 nieuw</StatusPill>} />
              <StatCard label="ACHTERSTAND" value="22" trailing={<StatusPill tone="warning">Risico</StatusPill>} />
            </div>

            <SectionHeading>Aanbevolen acties</SectionHeading>
            <div className={classes.cardStack}>
              <ActionCard
                tone="accent"
                icon={<IconBolt size={20} />}
                title="Korte sessie"
                focus="8 oefeningen · ~5 min"
                reason="Aangeraden nu."
                to="/session"
              />
              <ActionCard
                tone="warning"
                icon={<IconRefresh size={20} />}
                title="Werk achterstand weg"
                focus="22 reviews achter"
                reason="Op basis van je voortgang."
                to="/session?mode=catchup"
              />
              <ActionCard
                tone="danger"
                icon={<IconAlertTriangle size={20} />}
                title="Zwakke woorden"
                focus="6 woorden vragen aandacht"
                to="/session"
              />
            </div>
          </div>

          {/* ─ Settings-shaped ─ */}
          <div className={classes.compositionFrame}>
            <p className={classes.compositionLabel}>Composition C · Settings-shaped</p>
            <PageHeader title="Profiel" subtitle="Beheer je account en voorkeuren." />

            <SectionHeading>Sessie-instellingen</SectionHeading>
            <div className={classes.cardStack}>
              <SettingsCard
                title="Sessiegrootte"
                description="Aantal oefeningen per standaard sessie."
              >
                <Slider defaultValue={12} min={4} max={24} step={2} marks={[{ value: 4, label: '4' }, { value: 12, label: '12' }, { value: 24, label: '24' }]} />
              </SettingsCard>

              <SettingsCard
                title="Luisteroefeningen"
                description="Inschakelen om audio-MCQ en dictaat-oefeningen mee te nemen."
              >
                <Switch defaultChecked label="Audio-oefeningen actief" />
              </SettingsCard>

              <SettingsCard
                title="Interface-taal"
                description="Bepaalt de taal van de UI (niet de leerinhoud)."
              >
                <SegmentedControl data={[{ label: 'Nederlands', value: 'nl' }, { label: 'English', value: 'en' }]} defaultValue="nl" />
              </SettingsCard>

              <SettingsCard
                title="Account"
                description="Inloggegevens en accountacties."
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <IconUser size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'var(--fw-semibold)' }}>albertvduijn@proton.me</div>
                    <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Aangemeld sinds maart 2026</div>
                  </div>
                  <Button variant="light" color="red">Uitloggen</Button>
                </div>
              </SettingsCard>
            </div>
          </div>
        </div>

        {/* ─── 5. Seam contract smoke test ──────────────────────────────── */}
        <SectionHeading>5. Seam contract — mock Session (iPhone 390 × 844)</SectionHeading>
        <p className={classes.smokeNote}>
          PageContainer fit + PageBody variant=&quot;fit&quot; + sticky footer
          composed inside a fixed phone-sized frame. Verifies the seam
          contract: the MCQ prompt sits in normal flow inside the body, the
          options stack below it, and the Check button stays pinned to the
          bottom of the viewport without overflowing the frame. This is the
          exact shape every exercise session uses in production.
        </p>
        <div className={classes.phoneFrame}>
          <PageContainer fit>
            <PageHeader title="Oefening 1 van 16" />
            <PageBody variant="fit">
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 8 }}>
                Wat betekent dit getal?
              </div>
              <div className={classes.mockPromptCard}>enam</div>
              <div className={classes.mockOptionGroup}>
                <button className={classes.mockOption}>zestig</button>
                <button className={classes.mockOption}>2.000</button>
                <button className={classes.mockOption}>vijftig</button>
                <button className={classes.mockOption}>6</button>
              </div>
            </PageBody>
            <button className={classes.mockStickyFooter}>
              Check
              <IconChevronRight size={16} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
            </button>
          </PageContainer>
        </div>
      </PageContainer>
    </AdminGuard>
  )
}
