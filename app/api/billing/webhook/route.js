import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import {
  sendNewSubscriptionEmail,
  sendRenewalEmail,
  sendPaymentFailedEmail,
  sendCancellationEmail,
  sendAdminNotification,
} from "@/lib/email";

const EMAIL_TIMEOUT_MS = 4000;
const DB_TIMEOUT_MS = 2000;
const EVENT_TIMEOUT_MS = 4000;
const PROCESS_TIMEOUT_MS = 6000;

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function runEmailTask(task, label) {
  void withTimeout(Promise.resolve().then(task), EMAIL_TIMEOUT_MS, label).catch(
    (error) => {
      console.error(`${label} failed:`, error.message);
    },
  );
}

function logStage(tag, stage, startMs) {
  console.log(`[StripeWebhook] ${tag} ${stage} in ${Date.now() - startMs}ms`);
}

export async function POST(request) {
  const requestStartMs = Date.now();
  let webhookTag = "unknown-event";

  // Log headers
  const headers = {};
  for (const [key, value] of request.headers.entries()) {
    headers[key] = value;
  }
  // console.log("Headers:", JSON.stringify(headers, null, 2));

  try {
    // Get raw body
    const payload = await request.text();
    // Check for signature
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      console.error("MISSING STRIPE-SIGNATURE HEADER");
      return NextResponse.json(
        { error: "No stripe-signature header" },
        { status: 400 },
      );
    }

    // Verify webhook secret exists
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("MISSING STRIPE_WEBHOOK_SECRET ENV VARIABLE");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 },
      );
    }

    // console.log("Webhook secret configured");

    let event;
    const verifyStartMs = Date.now();
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      webhookTag = `${event.type}:${event.id}`;
      logStage(webhookTag, "signature_verified", verifyStartMs);
      // console.log("Event verified:", event.type, event.id);
    } catch (err) {
      console.error("SIGNATURE VERIFICATION FAILED:", err.message);
      return NextResponse.json(
        { error: "Webhook signature verification failed" },
        { status: 400 },
      );
    }

    let processed = true;

    try {
      await withTimeout(
        (async () => {
          const dbStartMs = Date.now();
          await withTimeout(connectDB(), DB_TIMEOUT_MS, "connectDB");
          logStage(webhookTag, "db_connected", dbStartMs);

          // Handle different event types
          const handlerStartMs = Date.now();
          switch (event.type) {
            case "checkout.session.completed":
              await withTimeout(
                handleCheckoutSessionCompleted(event.data.object),
                EVENT_TIMEOUT_MS,
                "checkout.session.completed",
              );
              break;

            case "invoice.payment_succeeded":
              await withTimeout(
                handleInvoicePaymentSucceeded(event.data.object),
                EVENT_TIMEOUT_MS,
                "invoice.payment_succeeded",
              );
              break;

            case "invoice.paid":
              await withTimeout(
                handleInvoicePaid(event.data.object),
                EVENT_TIMEOUT_MS,
                "invoice.paid",
              );
              break;

            case "customer.subscription.updated":
              await withTimeout(
                handleSubscriptionUpdated(event.data.object),
                EVENT_TIMEOUT_MS,
                "customer.subscription.updated",
              );
              break;

            case "customer.subscription.deleted":
              await withTimeout(
                handleSubscriptionDeleted(event.data.object),
                EVENT_TIMEOUT_MS,
                "customer.subscription.deleted",
              );
              break;

            case "invoice.payment_failed":
              await withTimeout(
                handleInvoicePaymentFailed(event.data.object),
                EVENT_TIMEOUT_MS,
                "invoice.payment_failed",
              );
              break;

            default:
            // console.log(` Unhandled event type: ${event.type}`);
          }
          logStage(webhookTag, "event_handled", handlerStartMs);
        })(),
        PROCESS_TIMEOUT_MS,
        "process_event",
      );

      logStage(webhookTag, "request_complete", requestStartMs);
    } catch (processingError) {
      processed = false;
      console.error(
        `[StripeWebhook] ${webhookTag} WEBHOOK PROCESSING ERROR (acknowledged to Stripe):`,
      );
      console.error("Message:", processingError.message);
      console.error("Stack:", processingError.stack);
    }

    // Always acknowledge verified Stripe events to avoid delivery failures/retries
    return NextResponse.json({
      received: true,
      processed,
      eventId: event.id,
      eventType: event.type,
    });
  } catch (error) {
    console.error(`[StripeWebhook] ${webhookTag} WEBHOOK PROCESSING ERROR:`);
    console.error("Message:", error.message);
    console.error("Stack:", error.stack);

    return NextResponse.json(
      {
        error: "Webhook handler failed",
        message: error.message,
      },
      { status: 500 },
    );
  }
}

// Handler functions
async function handleCheckoutSessionCompleted(session) {
  console.log("Handling checkout.session.completed");

  if (session.payment_status !== "paid") {
    console.log("Payment not paid, skipping");
    return;
  }

  const userId = session.metadata?.userId;
  if (!userId) {
    console.error("No userId in session metadata");
    return;
  }

  // Keep this path fast: avoid extra Stripe API calls inside webhook request
  let periodEnd = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000); // Default 30 days
  let startedAt = new Date(); // Default to now
  let lastInvoice = null;

  if (session.invoice) {
    lastInvoice = {
      invoiceId: session.invoice,
      invoicePdf: null,
      hostedInvoiceUrl: null,
      amountPaid: session.amount_total ?? null,
      currency: session.currency ?? null,
      paidAt: session.created ? new Date(session.created * 1000) : new Date(),
    };
  }

  // Validate periodEnd is a valid Date
  if (!periodEnd || isNaN(periodEnd.getTime())) {
    console.error("Invalid periodEnd date, using default");
    periodEnd = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
  }

  if (!startedAt || isNaN(startedAt.getTime())) {
    startedAt = new Date();
  }

  console.log("Final periodEnd:", periodEnd.toISOString());

  const tier = session.metadata?.tier || "tier2";
  const swapsAllowed = tier === "tier2" ? 2 : 3;

  // console.log(`Updating user ${userId} to ${tier} with ${swapsAllowed} swaps`);

  // Ensure currentPeriodEnd is a valid Date
  const updateDoc = {
    tier,
    swapsAllowed,
    swapsUsed: 0,
    stripeCustomerId: session.customer,
    isActive: true,
    subscription: {
      stripeSubscriptionId: session.subscription,
      status: "active",
      tier,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      startedAt: startedAt,
      lastInvoice: lastInvoice,
    },
  };

  // console.log("Update document:", JSON.stringify(updateDoc, null, 2));
  if (lastInvoice) {
    updateDoc.subscription.lastInvoice = {
      invoiceId: lastInvoice.invoiceId,
      invoicePdf: lastInvoice.invoicePdf,
      hostedInvoiceUrl: lastInvoice.hostedInvoiceUrl,
      amountPaid: lastInvoice.amountPaid,
      currency: lastInvoice.currency,
      paidAt: lastInvoice.paidAt,
    };
  }

  // console.log("Update document:", JSON.stringify(updateDoc, null, 2));

  const result = await withTimeout(
    User.findByIdAndUpdate(
      userId,
      { $set: updateDoc },
      { new: true, runValidators: true },
    ),
    DB_TIMEOUT_MS,
    "User.findByIdAndUpdate checkout",
  );

  if (!result) {
    console.error(`User ${userId} not found`);
    return;
  }

  console.log("User updated successfully");
  // After successful update, send email
  if (result) {
    // Send subscription email
    const tier = session.metadata?.tier || "tier2";
    const price = tier === "tier2" ? 4.99 : 9.99;

    runEmailTask(
      () =>
        sendNewSubscriptionEmail(result, {
          tier,
          currentPeriodEnd: periodEnd,
          price,
        }),
      "sendNewSubscriptionEmail",
    );

    runEmailTask(
      () => sendAdminNotification(result, tier, price),
      "sendAdminNotification",
    );
  }
}

async function handleInvoicePaymentSucceeded(invoice) {
  console.log("Handling invoice.payment_succeeded");

  // Skip initial invoice
  if (invoice.billing_reason === "subscription_create") {
    console.log("Initial invoice, skipping");
    return;
  }

  // Handle auto-renewal
  if (invoice.billing_reason === "subscription_cycle" && invoice.subscription) {
    console.log(
      " Processing auto-renewal for subscription:",
      invoice.subscription,
    );

    try {
      const subscription = await stripe.subscriptions.retrieve(
        invoice.subscription,
      );

      // Validate date before updating
      let periodEnd = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);

      if (subscription.current_period_end) {
        const timestamp = subscription.current_period_end * 1000;
        if (!isNaN(timestamp) && timestamp > 0) {
          periodEnd = new Date(timestamp);
        }
      }

      // Ensure valid date
      if (!periodEnd || isNaN(periodEnd.getTime())) {
        periodEnd = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
      }

      const user = await User.findOne({
        "subscription.stripeSubscriptionId": invoice.subscription,
      });

      if (user) {
        await User.findByIdAndUpdate(user._id, {
          $set: {
            "subscription.currentPeriodEnd": periodEnd,
            swapsUsed: 0,
          },
        });

        console.log(
          `Auto-renewal: ${user.email} renewed until ${periodEnd.toISOString()}`,
        );

        // Send renewal email
        runEmailTask(
          () =>
            sendRenewalEmail(user, {
              tier: user.tier,
              currentPeriodEnd: periodEnd,
            }),
          "sendRenewalEmail",
        );
      } else {
        console.error("User not found for subscription:", invoice.subscription);
      }
    } catch (error) {
      console.error("Error in auto-renewal:", error);
    }
  }
}
async function handleInvoicePaymentFailed(invoice) {
  console.log("Handling invoice.payment_failed");

  if (invoice.subscription) {
    const user = await User.findOne({
      "subscription.stripeSubscriptionId": invoice.subscription,
    });

    if (user) {
      await User.findByIdAndUpdate(user._id, {
        $set: {
          "subscription.status": "past_due",
        },
      });

      console.log(`Payment failed for ${user.email}`);

      // Send payment failed email
      runEmailTask(
        () => sendPaymentFailedEmail(user, invoice),
        "sendPaymentFailedEmail",
      );
    }
  }
}
async function handleSubscriptionUpdated(subscription) {
  console.log("Handling subscription update");

  const user = await User.findOne({ stripeCustomerId: subscription.customer });
  if (!user) {
    console.error("User not found for customer:", subscription.customer);
    return;
  }

  // FIX: Validate date
  let periodEnd = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
  if (subscription.current_period_end) {
    const timestamp = subscription.current_period_end * 1000;
    if (!isNaN(timestamp) && timestamp > 0) {
      periodEnd = new Date(timestamp);
    }
  }

  // Ensure valid
  if (!periodEnd || isNaN(periodEnd.getTime())) {
    periodEnd = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
  }

  const updates = {
    "subscription.status": subscription.status,
    "subscription.currentPeriodEnd": periodEnd,
    "subscription.cancelAtPeriodEnd":
      subscription.cancel_at_period_end || false,
  };

  if (subscription.status !== "active") {
    updates.tier = "free";
    updates.swapsAllowed = 1;
    updates.swapsUsed = 0;
    updates["subscription.tier"] = "free";
  }

  await User.findByIdAndUpdate(user._id, { $set: updates });
  // console.log(`Updated ${user.email} subscription to ${subscription.status}`);
}
async function handleSubscriptionDeleted(subscription) {
  console.log("Handling subscription deletion");

  const user = await User.findOne({
    "subscription.stripeSubscriptionId": subscription.id,
  });

  if (user) {
    await User.findByIdAndUpdate(user._id, {
      $set: {
        tier: "free",
        swapsAllowed: 1,
        swapsUsed: 0,
        "subscription.status": "canceled",
        "subscription.cancelAtPeriodEnd": false,
        "subscription.tier": "free",
      },
    });

    console.log("User downgraded to free tier");

    // Send cancellation email
    runEmailTask(
      () => sendCancellationEmail(user, { tier: user.tier }),
      "sendCancellationEmail",
    );
  }
}
async function handleInvoicePaid(invoice) {
  // console.log("Handling invoice.paid event");
  // console.log("Invoice ID:", invoice.id);
  // console.log("Billing reason:", invoice.billing_reason);

  if (!invoice.subscription) {
    console.log("No subscription in invoice, skipping");
    return;
  }

  try {
    // Find user by subscription ID
    const user = await User.findOne({
      "subscription.stripeSubscriptionId": invoice.subscription,
    });

    if (!user) {
      console.error("User not found for subscription:", invoice.subscription);
      return;
    }

    // Create lastInvoice object
    const lastInvoice = {
      invoiceId: invoice.id,
      invoicePdf: invoice.invoice_pdf,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      paidAt: new Date(invoice.created * 1000),
    };

    console.log("Updating user with invoice:", invoice.id);

    // Update user with lastInvoice
    await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          "subscription.lastInvoice": lastInvoice,
          "subscription.status": "active",
          updatedAt: new Date(),
        },
      },
      { new: true },
    );

    // console.log(`Invoice ${invoice.id} saved for user ${user.email}`);

    // If this is the first invoice, also set startedAt
    if (invoice.billing_reason === "subscription_create") {
      const subscription = await stripe.subscriptions.retrieve(
        invoice.subscription,
      );

      if (subscription.created) {
        const startedAt = new Date(subscription.created * 1000);
        await User.findByIdAndUpdate(user._id, {
          $set: {
            "subscription.startedAt": startedAt,
          },
        });
        // console.log("StartedAt set to:", startedAt.toISOString());
      }
    }
  } catch (error) {
    console.error("Error in handleInvoicePaid:", error);
  }
}
