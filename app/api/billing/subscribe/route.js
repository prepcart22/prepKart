import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { verifyAccessToken } from "@/lib/jwt";

export async function POST(request) {
  try {
    //  Get token
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);
    if (!decoded?.userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Connect DB
    await connectDB();

    // Get tier
    const { tier } = await request.json();
    if (!tier || !["tier2", "tier3"].includes(tier)) {
      return NextResponse.json(
        { error: "Select tier2 or tier3" },
        { status: 400 },
      );
    }

    // Get user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get price ID
    const priceId =
      tier === "tier2"
        ? process.env.STRIPE_TIER2_PRICE_ID
        : process.env.STRIPE_TIER3_PRICE_ID;

    if (!priceId) {
      return NextResponse.json(
        { error: "Price not configured" },
        { status: 400 },
      );
    }

    // Create/verify customer
    let customerId = user.stripeCustomerId;
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (error) {
        customerId = null; // Customer deleted
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || user.email,
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    // Create checkout
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    // Use baseUrl
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${baseUrl}/api/billing/confirm?session_id={CHECKOUT_SESSION_ID}&user_id=${user._id}&tier=${tier}`,
      cancel_url: `${baseUrl}/#pricing`,
      metadata: {
        userId: user._id.toString(),
        tier: tier,
        userEmail: user.email,
      },
    });

    return NextResponse.json({
      success: true,
      url: session.url,
      sessionId: session.id,
      testCard: "4242424242424242",
    });
  } catch (error) {
    console.error("Payment error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
