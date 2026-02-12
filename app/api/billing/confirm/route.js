import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function GET(request) {
  console.log("Confirm route called");

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const userId = searchParams.get("user_id");
  const tier = searchParams.get("tier");

  const origin = request.nextUrl.origin;

  if (!sessionId) {
    console.error("Missing session_id");
    return NextResponse.redirect(`${origin}/#pricing?error=missing_session`);
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    // console.log("Session status:", {
    //   id: session.id,
    //   payment_status: session.payment_status,
    //   status: session.status,
    //   userId: session.metadata?.userId,
    // });

    if (session.payment_status !== "paid") {
      console.log("Payment not paid, redirecting to pricing");
      return NextResponse.redirect(`${origin}/#pricing?error=not_paid`);
    }

    console.log("Payment verified - webhook will update database");

    // Redirect to home with success
    return NextResponse.redirect(`${origin}/en?payment=success&tier=${tier}`);
  } catch (error) {
    console.error("Confirm route error:", error);
    return NextResponse.redirect(
      `${origin}/#pricing?error=${encodeURIComponent(error.message)}`,
    );
  }
}
