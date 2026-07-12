// supabase/functions/stripe-webhook/index.ts
//
// §3.2 of docs/plans/2026-07-12-oauth-stripe-entitlement-design.md. No user
// JWT — authenticated by the `stripe-signature` header instead. Handles
// checkout.session.completed and customer.subscription.updated/deleted;
// everything else is recorded and acknowledged without further work.
//
// Idempotency: the event id is recorded in indonesian.stripe_webhook_events
// ONLY after processing succeeds, so a transient failure (500, no record)
// lets Stripe's retry reprocess instead of deduping a lost event. The
// precheck-then-record order admits a concurrent-duplicate race, which is
// harmless — every writer here is the same convergent fetch-fresh upsert
// (_shared/stripe/entitlement.ts), so re-applying is a no-op.
//
// Modeled on commit-capability-answer-report/index.ts (jsonResponse idiom,
// service-role PostgREST fetch pattern).

import type Stripe from 'npm:stripe@22.3.1'
import {
  findEntitlementUserIdForSubscription,
  getStripeClient,
  resolveId,
  upsertEntitlementFromSubscription,
} from '../_shared/stripe/index.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function publicReject(status: number, error: string): Response {
  return jsonResponse({ error }, status)
}

async function isEventAlreadyProcessed(
  supabaseUrl: string,
  serviceRoleKey: string,
  eventId: string,
): Promise<boolean> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/stripe_webhook_events?event_id=eq.${encodeURIComponent(eventId)}&select=event_id&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Accept-Profile': 'indonesian',
      },
    },
  )
  if (!response.ok) throw new Error(`webhook_event_lookup_failed:${response.status}`)
  const rows = await response.json().catch(() => null)
  return Array.isArray(rows) && rows.length > 0
}

async function recordEventProcessed(
  supabaseUrl: string,
  serviceRoleKey: string,
  eventId: string,
  eventType: string,
): Promise<void> {
  const response = await fetch(`${supabaseUrl}/rest/v1/stripe_webhook_events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      'Accept-Profile': 'indonesian',
      'Content-Profile': 'indonesian',
      // PostgREST's ON CONFLICT DO NOTHING equivalent — event_id is the PK.
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify([{ event_id: eventId, event_type: eventType }]),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`webhook_event_record_failed:${response.status}:${detail}`)
  }
}

async function handleCheckoutSessionCompleted(
  supabaseUrl: string,
  serviceRoleKey: string,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.client_reference_id
  const customerId = resolveId(session.customer)
  const subscriptionId = resolveId(session.subscription)
  if (!userId || !customerId || !subscriptionId) {
    // Not attributable to a user (or not a subscription checkout) — a
    // permanent condition, so we log loudly but do NOT throw: throwing here
    // would leave the event unrecorded and Stripe would retry it forever
    // for a shape that will never resolve.
    console.error('checkout_session_completed_missing_reference', {
      sessionId: session.id,
      userId,
      customerId,
      subscriptionId,
    })
    return
  }
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  await upsertEntitlementFromSubscription({
    supabaseUrl,
    serviceRoleKey,
    userId,
    stripeCustomerId: customerId,
    subscription,
  })
}

async function handleSubscriptionLifecycleEvent(
  supabaseUrl: string,
  serviceRoleKey: string,
  stripe: Stripe,
  subscriptionFromEvent: Stripe.Subscription,
): Promise<void> {
  // Fetch-fresh: re-retrieve rather than trust the event payload, so
  // out-of-order delivery converges on Stripe's current state regardless of
  // which event arrives last (§3.2 step 3).
  const subscription = await stripe.subscriptions.retrieve(subscriptionFromEvent.id)
  const customerId = resolveId(subscription.customer)
  if (!customerId) {
    console.error('subscription_event_missing_customer', { subscriptionId: subscription.id })
    return
  }
  const userId = await findEntitlementUserIdForSubscription(supabaseUrl, serviceRoleKey, {
    subscriptionId: subscription.id,
    customerId,
  })
  if (!userId) {
    // No entitlement row matches this subscription/customer — e.g. the
    // learner account was already erased (delete-account cascades the row).
    // Nothing to converge; log and move on rather than fail the delivery.
    console.error('subscription_event_no_matching_entitlement', {
      subscriptionId: subscription.id,
      customerId,
    })
    return
  }
  await upsertEntitlementFromSubscription({
    supabaseUrl,
    serviceRoleKey,
    userId,
    stripeCustomerId: customerId,
    subscription,
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok')
  }
  if (request.method !== 'POST') {
    return publicReject(405, 'method_not_allowed')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    return publicReject(500, 'server_not_configured')
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return publicReject(400, 'missing_signature')
  }

  const rawBody = await request.text()

  let stripe: Stripe
  let event: Stripe.Event
  try {
    stripe = getStripeClient()
    // The async variant is required — Deno's SubtleCrypto is async-only, and
    // the sync `constructEvent` throws in edge runtimes (§3.2 step 1).
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret)
  } catch (error) {
    console.error('stripe_webhook_signature_verification_failed', error)
    return publicReject(400, 'invalid_signature')
  }

  try {
    if (await isEventAlreadyProcessed(supabaseUrl, serviceRoleKey, event.id)) {
      return jsonResponse({ received: true, idempotent: true })
    }
  } catch (error) {
    console.error('stripe_webhook_idempotency_check_failed', error)
    return publicReject(500, 'webhook_processing_failed')
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(
          supabaseUrl,
          serviceRoleKey,
          stripe,
          event.data.object as Stripe.Checkout.Session,
        )
        break
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionLifecycleEvent(
          supabaseUrl,
          serviceRoleKey,
          stripe,
          event.data.object as Stripe.Subscription,
        )
        break
      default:
        // All other event types: no handling needed, just acknowledge.
        break
    }

    await recordEventProcessed(supabaseUrl, serviceRoleKey, event.id, event.type)
    return jsonResponse({ received: true })
  } catch (error) {
    // Transient failure — do NOT record the event id, so Stripe's retry
    // reprocesses it (§3.2 step 4).
    console.error('stripe_webhook_processing_failed', { eventId: event.id, eventType: event.type, error })
    return publicReject(500, 'webhook_processing_failed')
  }
})
