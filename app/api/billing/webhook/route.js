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

export async function POST(request) {
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
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      // console.log("Event verified:", event.type, event.id);
    } catch (err) {
      console.error("SIGNATURE VERIFICATION FAILED:", err.message);
      return NextResponse.json(
        { error: "Webhook signature verification failed" },
        { status: 400 },
      );
    }

    // Connect to DB
    try {
      await connectDB();
      console.log("Database connected");
    } catch (dbError) {
      console.error("Database connection failed:", dbError.message);
      throw dbError;
    }

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;

      default:
        // console.log(` Unhandled event type: ${event.type}`);
    }

    console.log("Webhook processed successfully");
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("WEBHOOK PROCESSING ERROR:");
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
    throw new Error("No userId in session metadata");
  }

  // Get subscription details with proper error handling
  let periodEnd = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000); // Default 30 days
  let startedAt = new Date(); // Default to now
  let lastInvoice = null;

  if (session.subscription) {
    try {
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription,
      );
      // console.log("subscription", subscription);
      // Set startedAt from subscription creation
      if (subscription.created) {
        const timestamp = subscription.created * 1000;
        if (!isNaN(timestamp) && timestamp > 0) {
          startedAt = new Date(timestamp);
          console.log("Subscription started at:", startedAt.toISOString());
        }
      }

      // Validate the timestamp before creating Date
      if (subscription.current_period_end) {
        const timestamp = subscription.current_period_end * 1000;
        if (!isNaN(timestamp) && timestamp > 0) {
          periodEnd = new Date(timestamp);
          // console.log("Subscription period end:", periodEnd.toISOString());
        } else {
          console.warn(
            "Invalid subscription timestamp:",
            subscription.current_period_end,
          );
        }
      } else {
        console.warn("No current_period_end in subscription");
      }

      // Get last invoice
      const invoices = await stripe.invoices.list({
        subscription: session.subscription, // Changed from customer to subscription
        limit: 1,
      });

      const invoice = invoices.data[0];
      // console.log("invoice", invoice);
      if (invoice) {
        lastInvoice = {
          invoiceId: invoice.id,
          invoicePdf: invoice.invoice_pdf,
          hostedInvoiceUrl: invoice.hosted_invoice_url,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          paidAt: new Date(invoice.created * 1000),
        };
        // console.log("Last invoice retrieved:", invoice.id);
      }
    } catch (error) {
      console.error("Failed to retrieve subscription:", error.message);
      // Keep default periodEnd
    }
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

  const result = await User.findByIdAndUpdate(
    userId,
    { $set: updateDoc },
    { new: true, runValidators: true },
  );

  if (!result) {
    throw new Error(`User ${userId} not found`);
  }

  console.log("User updated successfully");
  // After successful update, send email
  if (result) {
    console.log("User updated successfully");

    // Send subscription email
    try {
      const tier = session.metadata?.tier || "tier2";
      const price = tier === "tier2" ? 4.99 : 9.99;

      // send email to user
      await sendNewSubscriptionEmail(result, {
        tier,
        currentPeriodEnd: periodEnd,
        price,
      });

      // console.log("Subscription email sent to:", result.email);

      // send email to admin
      await sendAdminNotification(result, tier, price);
      console.log("Admin notification sent");
    } catch (emailError) {
      console.error("Failed to send subscription email:", emailError.message);
      // Don't fail the webhook if email fails
    }
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
        try {
          await sendRenewalEmail(user, {
            tier: user.tier,
            currentPeriodEnd: periodEnd,
          });
          console.log(`Renewal email sent to ${user.email}`);
        } catch (emailError) {
          console.error("Failed to send renewal email:", emailError.message);
        }
      } else {
        console.error("User not found for subscription:", invoice.subscription);
      }
    } catch (error) {
      console.error("Error in auto-renewal:", error);
      throw error;
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
      try {
        await sendPaymentFailedEmail(user, invoice);
        console.log("Payment failed email sent to:", user.email);
      } catch (emailError) {
        console.error(
          "Failed to send payment failed email:",
          emailError.message,
        );
      }
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
    try {
      await sendCancellationEmail(user, { tier: user.tier });
      console.log("Cancellation email sent to:", user.email);
    } catch (emailError) {
      console.error("Failed to send cancellation email:", emailError.message);
    }
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
