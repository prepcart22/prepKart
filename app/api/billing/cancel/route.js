import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { verifyAccessToken } from "@/lib/jwt";
import { sendCancellationEmail } from "@/lib/email";

export async function POST(request) {
  try {
    // Auth check
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);

    if (!decoded?.userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    await connectDB();

    // Get user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user has active subscription
    if (!user.subscription?.stripeSubscriptionId || user.tier === "free") {
      return NextResponse.json(
        {
          error: "No active subscription to cancel",
        },
        { status: 400 }
      );
    }

    // console.log(
    //   `Cancelling subscription immediately for ${user.email}, tier: ${user.tier}`
    // );

    let stripeResponse = null;

    // CANCEL IMMEDIATELY (not at period end)
    try {
      stripeResponse = await stripe.subscriptions.cancel(
        user.subscription.stripeSubscriptionId
        // No parameters = cancel immediately
      );
      // console.log("Subscription cancelled immediately in Stripe");
    } catch (stripeError) {
      console.error("Stripe cancellation error:", stripeError.message);

      // If subscription already cancelled in Stripe, just update database
      if (stripeError.code === "resource_missing") {
        // console.log("Subscription already cancelled in Stripe");
      } else {
        // console.log(
        //   "Could not cancel in Stripe, but updating database to free"
        // );
      }
    }

    // UPDATE USER TO FREE TIER IMMEDIATELY
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          tier: "free",
          swapsAllowed: 1,
          swapsUsed: 0,
          "subscription.status": "canceled",
          "subscription.cancelAtPeriodEnd": false,
          "subscription.cancelledAt": new Date(),
          "subscription.currentPeriodEnd": null,
        },
      },
      { new: true }
    );

    // send cancellation mail
    await sendCancellationEmail(user, {
      tier: user.tier,
    });

    // console.log(`User ${user.email} downgraded to Free tier immediately`);

    return NextResponse.json({
      success: true,
      message: "Subscription cancelled immediately.",
      user: {
        email: updatedUser.email,
        tier: updatedUser.tier,
        swapsAllowed: updatedUser.swapsAllowed,
      },
    });
  } catch (error) {
    console.error("Cancel error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Cancellation failed",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
