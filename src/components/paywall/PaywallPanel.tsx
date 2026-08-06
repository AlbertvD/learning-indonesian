// src/components/paywall/PaywallPanel.tsx
//
// The app's single monetization surface (docs/plans/2026-07-12-oauth-stripe-
// entitlement-design.md §5). Two callsites today: the lesson-activation
// paywall mirror (ActivationGate, for lessons beyond FREE_TIER_MAX_LESSON)
// and the Profile subscription block's free-plan state. Both need the exact
// same pricing presentation, so this is a standalone component rather than
// two bespoke ones — one card, two subscribe buttons, each POSTing to
// `create-checkout-session` and redirecting the browser to the returned
// Stripe Checkout URL.
//
// Outer shell reuses HeroCard (page/primitives) — its gradient-card
// treatment is exactly the "prominent, eye-catching" surface a single
// monetization panel needs, and reusing it avoids re-declaring --card-bg/
// --card-border/--r-lg chrome. The inner two-up price grid (a "best deal"
// tone-accented plan, a savings badge, per-plan price + CTA) is not modeled
// by any existing primitive, so its CSS module owns exactly that shape —
// see PaywallPanel.module.css's own header.
//
// No plan ids leave the server — the wire body is `{ plan: 'monthly' |
// 'annual' }` (see create-checkout-session/index.ts's own comment); Stripe
// price ids stay server-side env vars.

import { useState } from 'react'
import { Button, Text } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { HeroCard } from '@/components/page/primitives'
import { supabase } from '@/lib/supabase'
import { logError } from '@/lib/logger'
import { extractEdgeFunctionErrorCode } from '@/lib/edgeFunctionError'
import { useT } from '@/hooks/useT'
import classes from './PaywallPanel.module.css'

type Plan = 'monthly' | 'annual'

async function startCheckout(plan: Plan): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-checkout-session', { body: { plan } })
  if (error) throw error
  const url = (data as { url?: string } | null)?.url
  if (!url) throw new Error('create-checkout-session returned no url')
  return url
}

export function PaywallPanel() {
  const T = useT()
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null)

  async function handleSubscribe(plan: Plan) {
    if (loadingPlan) return
    setLoadingPlan(plan)
    try {
      const url = await startCheckout(plan)
      window.location.href = url
      // Browser is navigating away — no further state update needed.
    } catch (err) {
      const code = await extractEdgeFunctionErrorCode(err)
      const message = code === 'missing_user_jwt' || code === 'invalid_user_jwt'
        ? T.paywall.sessionExpired
        : T.paywall.checkoutFailedMessage
      notifications.show({ color: 'red', title: T.paywall.checkoutFailedTitle, message })
      logError({ page: 'paywall', action: 'create-checkout-session', error: err })
      setLoadingPlan(null)
    }
  }

  return (
    <div data-testid="paywall-panel">
      <HeroCard>
        <p className={classes.eyebrow}>{T.paywall.eyebrow}</p>
        <h3 className={classes.title}>{T.paywall.title}</h3>
        <Text className={classes.subtitle}>{T.paywall.subtitle}</Text>

        <div className={classes.plans}>
          <article className={classes.plan}>
            <div className={classes.planHeader}>
              <span className={classes.planLabel}>{T.paywall.monthlyLabel}</span>
            </div>
            <div className={classes.planPriceRow}>
              <span className={classes.planPrice}>{T.paywall.monthlyPrice}</span>
              <span className={classes.planPeriod}>{T.paywall.monthlyPeriod}</span>
            </div>
            <Button
              fullWidth
              variant="default"
              loading={loadingPlan === 'monthly'}
              disabled={loadingPlan !== null && loadingPlan !== 'monthly'}
              onClick={() => handleSubscribe('monthly')}
            >
              {T.paywall.subscribeButton}
            </Button>
          </article>

          <article className={classes.planFeatured}>
            <span className={classes.badge}>{T.paywall.annualBadge}</span>
            <div className={classes.planHeader}>
              <span className={classes.planLabel}>{T.paywall.annualLabel}</span>
            </div>
            <div className={classes.planPriceRow}>
              <span className={classes.planPrice}>{T.paywall.annualPrice}</span>
              <span className={classes.planPeriod}>{T.paywall.annualPeriod}</span>
            </div>
            <p className={classes.planHint}>{T.paywall.annualHint}</p>
            <Button
              fullWidth
              loading={loadingPlan === 'annual'}
              disabled={loadingPlan !== null && loadingPlan !== 'annual'}
              onClick={() => handleSubscribe('annual')}
            >
              {T.paywall.subscribeButton}
            </Button>
          </article>
        </div>

        <ul className={classes.benefits}>
          <li><IconCheck size={15} className={classes.benefitIcon} />{T.paywall.benefitAllLessons}</li>
          <li><IconCheck size={15} className={classes.benefitIcon} />{T.paywall.benefitAudio}</li>
          <li><IconCheck size={15} className={classes.benefitIcon} />{T.paywall.benefitCancelAnytime}</li>
        </ul>

        <p className={classes.legal}>
          <a href="/voorwaarden">{T.paywall.termsLink}</a>
          <span aria-hidden="true"> · </span>
          <a href="/restitutie">{T.paywall.refundsLink}</a>
        </p>
      </HeroCard>
    </div>
  )
}
