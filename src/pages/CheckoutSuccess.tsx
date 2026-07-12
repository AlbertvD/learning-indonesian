// src/pages/CheckoutSuccess.tsx
//
// /checkout/success — the deterministic post-payment landing page
// (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §3.4/§5). Reads
// `session_id` from the Stripe-templated success URL
// (`{APP_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`, set
// server-side in create-checkout-session/index.ts), calls `verify-checkout`
// once with it, refreshes the store's entitlement, and shows a celebratory
// confirmation. verify-checkout's writer (the fetch-fresh upsert) is
// idempotent, so a user-triggered retry after a transient failure is safe —
// same call, same convergent result.
//
// Error-code contract (verify-checkout/index.ts): 400 missing_session_id,
// 403 user_mismatch → not retryable (the session itself is invalid or not
// this user's), generic failure + link to Profile. 500
// checkout_session_incomplete / verify_checkout_failed (and any
// unrecognised/network error) → retryable, Retry button re-calls
// verify-checkout with the same session_id. A `session_id` missing from the
// URL itself is treated the same as the 400 — no call is even made.
//
// The Stripe cancel_url (`${APP_BASE_URL}/checkout/cancel`, create-checkout-
// session/index.ts) is handled as a route redirect in App.tsx — no new page.

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Button } from '@mantine/core'
import { IconCircleCheck, IconAlertTriangle, IconClock } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  LoadingState,
  EmptyState,
} from '@/components/page/primitives'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { isActiveStatus, type EntitlementStatus } from '@/services/entitlementService'
import { extractEdgeFunctionErrorCode } from '@/lib/edgeFunctionError'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'

type ViewState = 'loading' | 'success' | 'pending' | 'retryable' | 'blocked'

// 403/400 mean the session itself can't be confirmed by retrying the same
// call — everything else (500s, network errors, unknown codes) is treated
// as transient and gets the retry affordance.
const NON_RETRYABLE_CODES = new Set(['missing_session_id', 'user_mismatch'])

export function CheckoutSuccess() {
  const T = useT()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const refreshEntitlement = useAuthStore(s => s.refreshEntitlement)
  const [state, setState] = useState<ViewState>('loading')

  const verify = useCallback(async () => {
    if (!sessionId) {
      setState('blocked')
      return
    }
    setState('loading')
    try {
      const { data, error } = await supabase.functions.invoke('verify-checkout', { body: { sessionId } })
      if (error) throw error
      const status = (data as { status?: EntitlementStatus } | null)?.status
      await refreshEntitlement()
      setState(status && isActiveStatus(status) ? 'success' : 'pending')
    } catch (err) {
      const code = await extractEdgeFunctionErrorCode(err)
      setState(code && NON_RETRYABLE_CODES.has(code) ? 'blocked' : 'retryable')
      logError({ page: 'checkout-success', action: 'verify-checkout', error: err })
    }
  }, [sessionId, refreshEntitlement])

  useEffect(() => {
    void verify()
  }, [verify])

  if (state === 'loading') {
    return (
      <PageContainer size="sm">
        <PageBody>
          <LoadingState caption={T.checkout.verifyingTitle} />
        </PageBody>
      </PageContainer>
    )
  }

  if (state === 'success') {
    return (
      <PageContainer size="sm">
        <PageBody>
          <PageHeader title={T.checkout.successTitle} />
          <EmptyState
            icon={<IconCircleCheck size={48} />}
            message={T.checkout.successBody}
            cta={<Button onClick={() => navigate('/leren')}>{T.checkout.continueButton}</Button>}
          />
        </PageBody>
      </PageContainer>
    )
  }

  if (state === 'pending') {
    return (
      <PageContainer size="sm">
        <PageBody>
          <PageHeader title={T.checkout.pendingTitle} />
          <EmptyState
            icon={<IconClock size={48} />}
            message={T.checkout.pendingBody}
            cta={
              <>
                <Button onClick={() => void verify()}>{T.checkout.retryButton}</Button>
                <Button variant="default" ml="sm" onClick={() => navigate('/profile')}>{T.checkout.goToProfile}</Button>
              </>
            }
          />
        </PageBody>
      </PageContainer>
    )
  }

  if (state === 'retryable') {
    return (
      <PageContainer size="sm">
        <PageBody>
          <PageHeader title={T.checkout.errorTitle} />
          <EmptyState
            icon={<IconAlertTriangle size={48} />}
            message={T.checkout.errorRetryableBody}
            cta={<Button onClick={() => void verify()}>{T.checkout.retryButton}</Button>}
          />
        </PageBody>
      </PageContainer>
    )
  }

  // blocked — 400/403, or no session_id in the URL at all.
  return (
    <PageContainer size="sm">
      <PageBody>
        <PageHeader title={T.checkout.errorTitle} />
        <EmptyState
          icon={<IconAlertTriangle size={48} />}
          message={T.checkout.errorBlockedBody}
          cta={<Button variant="default" onClick={() => navigate('/profile')}>{T.checkout.goToProfile}</Button>}
        />
      </PageBody>
    </PageContainer>
  )
}
