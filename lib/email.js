import nodemailer from "nodemailer";

const emailPort = Number(process.env.EMAIL_PORT || 587);
const emailSecure =
  process.env.EMAIL_SECURE === "true" ||
  (process.env.EMAIL_SECURE !== "false" && emailPort === 465);

// Get credentials from environment
const emailConfig = {
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: emailPort,
  secure: emailSecure,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
};

function createTransporter(config = emailConfig) {
  return nodemailer.createTransport(config);
}

function isTlsHandshakeMismatch(error) {
  const message = (error?.message || "").toLowerCase();
  return (
    error?.code === "ESOCKET" &&
    (message.includes("wrong version number") ||
      message.includes("tls_validate_record_header"))
  );
}

async function sendMailWithTlsFallback(mailOptions) {
  try {
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    if (
      !isTlsHandshakeMismatch(error) &&
      error?.message !== "Unexpected socket close"
    ) {
      throw error;
    }

    const attempts = [
      {
        ...emailConfig,
        secure: !emailConfig.secure,
        port:
          emailConfig.port === 465
            ? 587
            : emailConfig.port === 587
              ? 465
              : emailConfig.port,
      },
      {
        ...emailConfig,
        secure: true,
        port: 465,
      },
      {
        ...emailConfig,
        secure: false,
        port: 587,
      },
    ];

    let lastError = error;

    for (const config of attempts) {
      try {
        console.warn(
          `SMTP retry with secure=${config.secure}, port=${config.port}`,
        );
        const attemptTransporter = createTransporter(config);
        return await attemptTransporter.sendMail(mailOptions);
      } catch (attemptError) {
        lastError = attemptError;
      }
    }

    throw lastError;
  }
}

// Create transporter
const transporter = createTransporter();

// Verify connection
if (process.env.EMAIL_VERIFY_ON_STARTUP === "true") {
  transporter.verify((error) => {
    if (error) {
      console.error("Email connection failed:", error.message);
    } else {
      console.log("Email server ready");
    }
  });
}

// Professional welcome email
export async function sendWelcomeEmail(user) {
  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: `Welcome to Prepcart, ${user.name}! 🎉`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #8cc63c 0%, #4a9fd8 100%); padding: 40px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Prepcart!</h1>
            <p style="color: white; opacity: 0.9; margin: 10px 0 0;">Your meal planning journey begins</p>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px; background: white; border-radius: 0 0 10px 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            <h2>Hello ${user.name},</h2>
            <p>Thank you for joining Prepcart! We're excited to simplify your meal planning.</p>
            
            <!-- Account Info -->
            <div style="background: #f8fafc; border-left: 4px solid #4a9fd8; padding: 20px; margin: 25px 0;">
              <h3 style="margin-top: 0; color: #2d3748;">Your Account Details</h3>
              <table style="width: 100%;">
                <tr>
                  <td style="padding: 8px 0; color: #4a5568;"><strong>Email:</strong></td>
                  <td style="padding: 8px 0;">${user.email}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #4a5568;"><strong>Province:</strong></td>
                  <td style="padding: 8px 0;">${user.province}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #4a5568;"><strong>Plan:</strong></td>
                  <td style="padding: 8px 0;">${
                    user.tier.charAt(0).toUpperCase() + user.tier.slice(1)
                  } Tier</td>
                </tr>
              </table>
            </div>
            
            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}" 
                 style="background: #8cc63c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">
                Start Planning Your Meals →
              </a>
            </div>
            
            <!-- Next Steps -->
            <h3 style="color: #2d3748;">What You Can Do Now:</h3>
            <ul style="line-height: 1.8;">
              <li>Generate personalized weekly meal plans</li>
              <li>Create automatic grocery lists</li>
              <li>Customize meals with your free swaps</li>
              <li>Track your nutrition goals</li>
            </ul>
            
            <!-- Footer -->
            <div style="border-top: 1px solid #e2e8f0; margin-top: 40px; padding-top: 20px; color: #718096; font-size: 12px;">
              <p>© ${new Date().getFullYear()} Prepcart. All rights reserved.</p>
              <p>This email was sent to ${
                user.email
              } as part of your registration.</p>
              <p>
                <a href="${
                  process.env.NEXT_PUBLIC_APP_URL
                }/privacy" style="color: #4a9fd8;">Privacy Policy</a> | 
                <a href="${
                  process.env.NEXT_PUBLIC_APP_URL
                }/unsubscribe" style="color: #4a9fd8;">Unsubscribe</a>
              </p>
            </div>
          </div>
        </div>
      `,
      text: `Welcome to Prepcart, ${user.name}!

Thank you for joining Prepcart! We're excited to simplify your meal planning.

ACCOUNT DETAILS:
- Email: ${user.email}
- Province: ${user.province}
- Plan: ${user.tier} Tier

GET STARTED:
1. Generate personalized weekly meal plans
2. Create automatic grocery lists  
3. Customize meals with your free swaps
4. Track your nutrition goals

Start planning: ${process.env.NEXT_PUBLIC_APP_URL}

Need help? Reply to this email.

© ${new Date().getFullYear()} Prepcart. All rights reserved.
This email was sent to ${user.email} as part of your registration.`,
    };

    const info = await sendMailWithTlsFallback(mailOptions);
    // console.log(`Professional welcome email sent to ${user.email}`);
    // console.log(`   Message ID: ${info.messageId}`);

    return info;
  } catch (error) {
    console.error("Email error:", error.message);
    // Don't throw error - registration should succeed regardless
    return null;
  }
}
// Password reset email
export const sendPasswordResetEmail = async (
  email,
  resetToken,
  user,
  locale = "en",
  requestOrigin,
) => {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || requestOrigin;
    const resetUrl = `${appUrl}/${locale}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: "Reset Your Prepcart Password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #8cc63c 0%, #4a9fd8 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Password Reset Request</h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 30px; background: white; border-radius: 0 0 10px 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            <h2>Hello ${user?.name || "User"},</h2>
            <p>You requested to reset your password for Prepcart.</p>
            <p>Click the button below to reset your password. This link will expire in <strong>1 hour</strong>.</p>
            
            <!-- Reset Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background: #8cc63c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">
                Reset Your Password →
              </a>
            </div>
            
            <!-- Alternative Link -->
            <p style="font-size: 14px; color: #666;">
              Or copy and paste this link in your browser:<br>
              <code style="background: #f5f5f5; padding: 8px; border-radius: 4px; word-break: break-all;">${resetUrl}</code>
            </p>
            
            <!-- Security Note -->
            <div style="background: #fff8e1; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #856404;">
                <strong>⚠️ Security Notice:</strong><br>
                If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
              </p>
            </div>
            
            <!-- Footer -->
            <div style="border-top: 1px solid #e2e8f0; margin-top: 30px; padding-top: 20px; color: #718096; font-size: 12px;">
              <p>© ${new Date().getFullYear()} Prepcart. All rights reserved.</p>
              <p>This link expires in 1 hour for security reasons.</p>
            </div>
          </div>
        </div>
      `,
      text: `Password Reset Request - Prepcart

Hello ${user?.name || "User"},

You requested to reset your password for Prepcart.

Click this link to reset your password: ${resetUrl}

This link will expire in 1 hour.

⚠️ Security Notice:
If you didn't request this password reset, please ignore this email. Your password will remain unchanged.

© ${new Date().getFullYear()} Prepcart. All rights reserved.`,
    };

    const info = await sendMailWithTlsFallback(mailOptions);
    console.log(`Password reset email sent to ${email}`);
    return info;
  } catch (error) {
    console.error("Password reset email error:", error.message);
    return null;
  }
};

// Password changed confirmation email
export const sendPasswordChangedEmail = async (email, user, locale = "en") => {
  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: "Your Prepcart Password Has Been Changed",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #8cc63c 0%, #4a9fd8 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Password Changed Successfully</h1>
          </div>
          
          <div style="padding: 30px; background: white; border-radius: 0 0 10px 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            <h2>Hello ${user.name},</h2>
            <p>Your Prepcart password has been successfully changed.</p>
            
            <div style="background: #e8f5e9; border: 1px solid #c8e6c9; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 0; color: #2e7d32;">
                <strong>✅ Password Updated:</strong><br>
                ${new Date().toLocaleString()}
              </p>
            </div>
            
            <div style="background: #fff8e1; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #856404;">
                <strong>🔒 Security Tip:</strong><br>
                If you did NOT make this change, please contact us immediately at support@prepcart.com
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/${locale}/login" 
                 style="background: #4a9fd8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Login to Your Account →
              </a>
            </div>
            
            <div style="border-top: 1px solid #e2e8f0; margin-top: 30px; padding-top: 20px; color: #718096; font-size: 12px;">
              <p>© ${new Date().getFullYear()} Prepcart. All rights reserved.</p>
              <p>This is a security notification for your account: ${email}</p>
            </div>
          </div>
        </div>
      `,
      text: `Password Changed Successfully - Prepcart

Hello ${user.name},

Your Prepcart password has been successfully changed on ${new Date().toLocaleString()}.

Security Tip:
If you did NOT make this change, please contact us immediately at support@prepcart.com

Login to your account: ${process.env.NEXT_PUBLIC_APP_URL}/${locale}/login

© ${new Date().getFullYear()} Prepcart. All rights reserved.`,
    };

    const info = await sendMailWithTlsFallback(mailOptions);
    console.log(`Password changed email sent to ${email}`);
    return info;
  } catch (error) {
    console.error("Password changed email error:", error.message);
    // Don't throw - password change should still succeed
    return null;
  }
};

// New Paid Subscription (first successful payment)
export const sendNewSubscriptionEmail = async (
  user,
  { tier, currentPeriodEnd, price },
) => {
  try {
    const tierName =
      tier === "tier2" ? "Plus" : tier === "tier3" ? "Premium" : "Unknown Plan";
    const periodEndDate = new Date(currentPeriodEnd).toLocaleDateString(
      "en-US",
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    );

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: `🎉 Your ${tierName} Plan is Now Active!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #8cc63c 0%, #4a9fd8 100%); padding: 40px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to ${tierName}!</h1>
          </div>
          <div style="padding: 40px; background: white; border-radius: 0 0 10px 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            <h2>Hello ${user.name || "there"},</h2>
            <p>Your <strong>${tierName}</strong> subscription is now active. Thank you!</p>
            
            <div style="background: #f8fafc; border-left: 4px solid #8cc63c; padding: 20px; margin: 25px 0;">
              <h3 style="margin-top: 0; color: #2d3748;">Your Plan Details</h3>
              <table style="width: 100%;">
                <tr><td style="padding: 8px 0; color: #4a5568;"><strong>Plan</strong></td><td>${tierName} • $${price}/month</td></tr>
                <tr><td style="padding: 8px 0; color: #4a5568;"><strong>Next billing</strong></td><td>${periodEndDate}</td></tr>
              </table>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard"
                 style="background: #8cc63c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Go to Dashboard →
              </a>
            </div>

            <div style="border-top: 1px solid #e2e8f0; margin-top: 40px; padding-top: 20px; color: #718096; font-size: 12px;">
              <p>© ${new Date().getFullYear()} Prepcart. All rights reserved.</p>
            </div>
          </div>
        </div>
      `,
      text: `Your ${tierName} Plan is Active!\n\nHello ${
        user.name || "there"
      },\n\nThank you for subscribing!\nPlan: ${tierName} • $${price}/month\nNext billing: ${periodEndDate}\n\nDashboard: ${
        process.env.NEXT_PUBLIC_APP_URL
      }/dashboard`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`New subscription email sent to ${user.email}`);
  } catch (error) {
    console.error("New subscription email failed:", error);
  }
};

// Renewal Success
export const sendRenewalEmail = async (user, { tier, currentPeriodEnd }) => {
  try {
    const tierName =
      tier === "tier2" ? "Plus" : tier === "tier3" ? "Premium" : "Unknown";
    const periodEndDate = new Date(currentPeriodEnd).toLocaleDateString();

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: `Your ${tierName} Plan Renewed Successfully`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: white; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <h2 style="color: #2d3748;">Subscription Renewed</h2>
          <p>Hello ${user.name || "there"},</p>
          <p>Your <strong>${tierName}</strong> plan has been renewed.</p>
          <p style="font-size: 18px; color: #2e7d32; font-weight: bold;">Active until: ${periodEndDate}</p>
          <div style="text-align: center; margin: 25px 0;">
            <a href="${
              process.env.NEXT_PUBLIC_APP_URL
            }/dashboard" style="background: #4a9fd8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              View Account
            </a>
          </div>
        </div>
      `,
      text: `Renewal successful!\nYour ${tierName} plan is now active until ${periodEndDate}.`,
    });
    console.log(`Renewal email sent to ${user.email}`);
  } catch (error) {
    console.error("Renewal email failed:", error);
  }
};

// Payment Failed (Urgent)
export const sendPaymentFailedEmail = async (user, invoice) => {
  try {
    const amount = (invoice.amount_due / 100).toFixed(2);
    const nextAttempt = invoice.next_payment_attempt
      ? new Date(invoice.next_payment_attempt * 1000).toLocaleString()
      : "soon";

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: "⚠️ Payment Failed - Please Update Your Card",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: white; border: 1px solid #fee2e2; border-radius: 10px;">
          <h2 style="color: #c53030;">Payment Issue</h2>
          <p>Hello ${user.name || "there"},</p>
          <p>We couldn't charge $${amount} for your subscription renewal.</p>
          <p><strong>Next attempt:</strong> ${nextAttempt}</p>
          <p style="margin: 20px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing"
               style="background: #e53e3e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Update Payment Method
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">Please fix this soon to avoid losing access.</p>
        </div>
      `,
      text: `Payment failed!\nAmount: $${amount}\nNext attempt: ${nextAttempt}\nPlease update your card: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    });
    console.log(`Payment failed email sent to ${user.email}`);
  } catch (error) {
    console.error("Payment failed email failed:", error);
  }
};

// Cancellation (Immediate)
export const sendCancellationEmail = async (user, { tier }) => {
  try {
    const tierName =
      tier === "tier2" ? "Plus" : tier === "tier3" ? "Premium" : "Unknown";

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: "Your Subscription Has Been Cancelled",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: white; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <h2 style="color: #2d3748;">Subscription Cancelled</h2>
          <p>Hello ${user.name || "there"},</p>
          <p>Your ${tierName} plan has been cancelled as requested.</p>
          <p style="color: #744210; background: #fefcbf; padding: 12px; border-radius: 6px;">
            No more charges. You now have Free plan access.
          </p>
          <div style="text-align: center; margin: 25px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/#pricing"
               style="background: #8cc63c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              See Plans Again
            </a>
          </div>
        </div>
      `,
      text: `Subscription cancelled.\nYour ${tierName} plan is now inactive.\nYou have Free access now.`,
    });
    console.log(`Cancellation email sent to ${user.email}`);
  } catch (error) {
    console.error("Cancellation email failed:", error);
  }
};

// Admin notification for new registered users
export const sendAdminNotificationNewUser = async (user, tier = "free") => {
  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to:
        process.env.ADMIN_EMAIL_NEW ||
        process.env.EMAIL_USER ||
        "admin@yourdomain.com",
      subject: `🆕 New User Registration: ${user.email}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2d3748; border-bottom: 2px solid #8cc63c; padding-bottom: 10px;">
            New User Registered
          </h2>
          
          <div style="background: #f7fafc; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <p><strong>Name:</strong> ${user.name || "—"}</p>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Province:</strong> ${user.province || "—"}</p>
            <p><strong>Plan:</strong> ${tier.charAt(0).toUpperCase() + tier.slice(1)}</p>
            <p><strong>Registered:</strong> ${new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" })}</p>
          </div>

          <p style="color: #718096; font-size: 14px;">
            Total users are growing!
          </p>
        </div>
      `,
      text: `
New user registration on Prepcart

Name:     ${user.name || "—"}
Email:    ${user.email}
Province: ${user.province || "—"}
Plan:     ${tier}
Time:     ${new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" })}

Keep up the good work!
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      `Admin notified about new user ${user.email} — Msg ID: ${info.messageId}`,
    );
  } catch (err) {
    console.error(
      "Failed to notify admin about new registration:",
      err.message,
    );
  }
};

// Admin notification for new subscriptions
export const sendAdminNotification = async (user, tier, amount) => {
  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: process.env.ADMIN_EMAIL_NEW || process.env.EMAIL_FROM,
      subject: `New Subscription: ${user.email}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2d3748;">New Subscription Alert</h2>
          <div style="background: #f7fafc; padding: 15px; border-radius: 6px;">
            <p><strong>User:</strong> ${user.name} (${user.email})</p>
            <p><strong>Tier:</strong> ${tier}</p>
            <p><strong>Amount:</strong> $${amount}</p>
            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
      `,
      text: `New Subscription\nUser: ${user.name} (${
        user.email
      })\nTier: ${tier}\nAmount: $${amount}\nTime: ${new Date().toLocaleString()}`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Admin notification sent for ${user.email}`);
  } catch (error) {
    console.error("Admin notification failed:", error);
  }
};

// Newsletter subscription welcome email
export async function sendSubscriptionWelcomeEmail(subscriber) {
  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Prepcart"}" <${process.env.EMAIL_FROM}>`,
      to: subscriber.email,
      subject: "Welcome to Prepcart's Newsletter! 🎉",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #8cc63c; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to PrepCart!</h1>
          </div>
          <div style="padding: 30px; background: white; border-radius: 0 0 10px 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h2 style="color: #2d3748; margin-top: 0;">Thank you for subscribing!</h2>
            <p>Hi there,</p>
            <p>You've successfully subscribed to PrepCart's newsletter.</p>
            <div style="background: #f8fafc; border-left: 4px solid #8cc63c; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #4a5568;">
                <strong>Email:</strong> ${subscriber.email}<br>
                <strong>Postal Code:</strong> ${subscriber.postalCode}<br>
                <strong>Date:</strong> ${new Date().toLocaleDateString()}
              </p>
            </div>
            <p>We'll send you meal planning tips, recipes, and special offers.</p>
            <div style="border-top: 1px solid #e2e8f0; margin-top: 30px; padding-top: 20px; color: #718096; font-size: 12px;">
              <p>© ${new Date().getFullYear()} PrepCart. All rights reserved.</p>
            </div>
          </div>
        </div>
      `,
      text: `Welcome to PrepCart's Newsletter!

Thank you for subscribing to PrepCart's newsletter!

Email: ${subscriber.email}
Postal Code: ${subscriber.postalCode}
Date: ${new Date().toLocaleDateString()}

We'll send you meal planning tips, recipes, and special offers.

© ${new Date().getFullYear()} PrepCart. All rights reserved.`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Newsletter email sent to ${subscriber.email}`);
    return info;
  } catch (error) {
    console.error("Newsletter email error:", error.message);
    return null;
  }
}

// Admin notification for newsletter subscription
export async function sendSubscriptionNotificationToAdmin(subscriber) {
  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Prepcart"}" <${process.env.EMAIL_FROM}>`,
      to: process.env.ADMIN_EMAIL_NEW || process.env.EMAIL_USER,
      subject: `New Newsletter Subscriber: ${subscriber.email}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>New Newsletter Subscriber</h2>
          <div style="background: #f8fafc; padding: 15px; border-radius: 6px;">
            <p><strong>Email:</strong> ${subscriber.email}</p>
            <p><strong>Postal Code:</strong> ${subscriber.postalCode}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
      `,
      text: `New Newsletter Subscriber
Email: ${subscriber.email}
Postal Code: ${subscriber.postalCode}
Date: ${new Date().toLocaleString()}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Admin notified about: ${subscriber.email}`);
    return info;
  } catch (error) {
    console.error("Admin notification error:", error.message);
    return null;
  }
}

export default transporter;
