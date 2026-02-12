import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Plan from "@/models/Plan";
import { authenticate } from "@/middleware/auth";

export async function GET(request) {
  try {
    await connectDB();
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/").filter((segment) => segment);

    // If the last segment is "save" or "swap", return 404 or 405
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment === "save" || lastSegment === "swap") {
      return NextResponse.json(
        {
          error: "Method not allowed",
          message: "Use POST request for this endpoint",
        },
        { status: 405 }, // 405 = Method Not Allowed
      );
    }

    // 1. AUTHENTICATION CHECK
    const authResult = await authenticate(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error, message: authResult.message },
        { status: authResult.status || 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("userId");
    // Case 1: Fetch single plan by ID
    if (id) {
      const plan = await Plan.findById(id).lean();

      if (!plan) {
        return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      }

      // AUTHORIZATION: Check if plan belongs to user
      if (
        plan.userId &&
        plan.userId.toString() !== authResult.userId.toString()
      ) {
        return NextResponse.json(
          { error: "Access denied to this plan" },
          { status: 403 },
        );
      }

      return NextResponse.json(plan);
    }

    // Case 2: Fetch plans for a user
    if (userId) {
      const plans = await Plan.find({ userId: userId }).lean();

      // Debug logging
      // console.log(`User ${authResult.userId} requesting plans for ${userId}`);
      // console.log(`Found ${plans.length} plans`);

      return NextResponse.json(plans);
    }

    // Case 3: No parameters
    return NextResponse.json({ error: "Parameter required" }, { status: 400 });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
