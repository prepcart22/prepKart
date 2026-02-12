import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Plan from "@/models/Plan";
import { authenticate } from "@/middleware/auth";

export async function GET(request, { params }) {
  try {
    await connectDB();

    const { id } = await params;

    // console.log("Fetching plan with ID:", id);

    const plan = await Plan.findById(id).lean();

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json(plan);
  } catch (error) {
    console.error("Error fetching plan:", error);
    return NextResponse.json(
      { error: "Failed to fetch plan: " + error.message },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    await connectDB();

    const { id } = await params;
    // console.log("DELETE request for plan ID:", id);

    // 1. AUTHENTICATION CHECK
    const authResult = await authenticate(request);
    // console.log("Authentication result:", {
    //   success: authResult.success,
    //   userId: authResult.userId,
    //   userEmail: authResult.userEmail,
    // });

    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error, message: authResult.message },
        { status: authResult.status || 401 },
      );
    }

    const userId = authResult.userId;
    // console.log("Authenticated user ID:", userId);

    // 2. Find the plan
    const plan = await Plan.findById(id);

    if (!plan) {
      return NextResponse.json(
        { error: "Meal plan not found" },
        { status: 404 },
      );
    }

    // console.log("Plan found:", {
    //   planId: plan._id,
    //   planUserId: plan.userId,
    //   planUserEmail: plan.userEmail,
    // });

    // 3. Check if user owns the plan - FIXED COMPARISON
    // Convert both to strings for comparison
    const planUserIdStr = plan.userId.toString();
    const requestUserIdStr = userId.toString();

    // console.log("Comparing IDs:");
    // console.log("   Plan user ID:", planUserIdStr);
    // console.log("   Request user ID:", requestUserIdStr);
    // console.log("   Match?", planUserIdStr === requestUserIdStr);

    // FIX: Use equality operator, not assignment
    if (planUserIdStr !== requestUserIdStr) {
      // console.log("Permission denied - User doesn't own this plan");
      return NextResponse.json(
        { error: "You don't have permission to delete this plan" },
        { status: 403 },
      );
    }

    // 4. Delete the plan
    await Plan.findByIdAndDelete(id);

    console.log("Plan deleted successfully");

    return NextResponse.json({
      success: true,
      message: "Meal plan deleted successfully",
    });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      {
        error: "Failed to delete meal plan",
        message: error.message,
      },
      { status: 500 },
    );
  }
}
