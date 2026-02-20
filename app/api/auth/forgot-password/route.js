import { connectDB } from "@/lib/db";
import User from "@/models/User";
import crypto from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(request) {
  try {
    await connectDB();

    // const { email } = await request.json();
    const { email, locale = "en" } = await request.json();
    if (!email) {
      return Response.json(
        { success: false, error: "Email is required" },
        { status: 400 },
      );
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return success (for security - don't reveal if user exists)
    if (!user) {
      // Return success even if user doesn't exist (security best practice)
      return Response.json({
        success: true,
        message:
          "If your email exists in our system, you will receive a password reset link.",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Set token and expiry (1 hour)
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    await user.save({ validateBeforeSave: false });

    // Send email
    const emailResult = await sendPasswordResetEmail(
      user.email,
      resetToken,
      user,
      locale,
      request.nextUrl.origin,
    );

    if (!emailResult) {
      return Response.json({
        success: true,
        message:
          "If your email exists in our system, you will receive a password reset link.",
      });
    }

    return Response.json({
      success: true,
      message: "Password reset link sent to your email",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return Response.json(
      {
        success: false,
        error: "Failed to process password reset request",
      },
      { status: 500 },
    );
  }
}
