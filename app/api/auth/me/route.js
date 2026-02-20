import { verifyAccessToken } from "@/lib/jwt";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import mongoose from "mongoose";

export async function GET(request) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return Response.json(
        {
          success: false,
          error: "Not authenticated",
          message: "No authentication token found",
        },
        { status: 401 },
      );
    }

    const token = authHeader.split(" ")[1];

    // Verify token
    const decoded = verifyAccessToken(token);
    const userId = decoded?.userId || decoded?.id;

    if (!decoded || !userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return Response.json(
        {
          success: false,
          error: "Invalid or expired token",
          message: "Please login again",
        },
        { status: 401 },
      );
    }

    // Connect to DB and get user
    await connectDB();
    const user = await User.findById(userId).select("-password -refreshToken");

    if (!user) {
      return Response.json(
        {
          success: false,
          error: "User not found",
        },
        { status: 404 },
      );
    }

    // Return user data
    return Response.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        province: user.province,
        tier: user.tier,
        marketing_consent: user.marketing_consent || false,
        monthly_plan_count: user.monthly_plan_count || 0,
        weekly_plan_count: user.weekly_plan_count || 0,
        ageVerified: user.ageVerified || false,
        emailVerified: user.emailVerified || false,
        preferences: user.preferences || {},
        subscription: user.subscription || {},
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        swapsAllowed: user.swapsAllowed || 3,
        swapsUsed: user.swapsUsed || 0,
        planGenerationCount: user.planGenerationCount || 0,
      },
    });
  } catch (error) {
    console.error("Get user error:", error.message);
    return Response.json(
      {
        success: false,
        error: "Failed to get user data: " + error.message,
      },
      { status: 500 },
    );
  }
}
