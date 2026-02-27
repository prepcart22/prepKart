import { NextResponse } from "next/server";
import User from "@/models/User";
import Click from "@/models/Click";
import { authenticate, requireAdmin } from "@/middleware/auth";
import { connectDB } from "@/lib/db";
import Blogs from "@/models/Blog";
import Plan from "@/models/Plan";

// Get start and end dates for current and previous months
const getMonthRanges = () => {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );

  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59,
    999,
  );

  return {
    currentMonthStart,
    currentMonthEnd,
    previousMonthStart,
    previousMonthEnd,
  };
};

// Helper to calculate month-over-month growth
const calculateGrowth = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

export async function GET(request) {
  try {
    // Use your existing authenticate middleware
    const authResult = await authenticate(request);

    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error || "Unauthorized" },
        { status: authResult.status || 401 },
      );
    }

    // Check if user is admin using your middleware function
    if (!requireAdmin(authResult.userTier)) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    await connectDB();

    const {
      currentMonthStart,
      currentMonthEnd,
      previousMonthStart,
      previousMonthEnd,
    } = getMonthRanges();

    // Run all queries in parallel for better performance
    const [
      totalUsers,
      previousMonthUsers,
      activeSubscribers,
      previousMonthSubscribers,
      instacartClicks,
      previousMonthInstacartClicks,
      mealPlansGenerated,
      previousMonthMealPlans,
      blogs,
      previousMonthBlogs,
      // Add revenue queries here when you have payment model
    ] = await Promise.all([
      // 1. Total Users
      User.countDocuments({}),
      User.countDocuments({
        createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd },
      }),

      // 2. Active Subscribers
      User.countDocuments({
        "subscription.status": "active",
      }),
      User.countDocuments({
        "subscription.status": "active",
        "subscription.currentPeriodEnd": {
          $gte: previousMonthStart,
          $lte: previousMonthEnd,
        },
      }),

      // 3. Instacart Clicks
      Click.countDocuments({
        type: "instacart",
        timestamp: { $gte: currentMonthStart, $lte: currentMonthEnd },
      }),
      Click.countDocuments({
        type: "instacart",
        timestamp: { $gte: previousMonthStart, $lte: previousMonthEnd },
      }),

      // 4. Meal Plans Generated
      Plan.countDocuments({
        createdAt: { $gte: currentMonthStart, $lte: currentMonthEnd },
      }),
      Plan.countDocuments({
        createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd },
      }),

      // 5. Blog Traffic
      Blogs.find({
        publishedAt: { $gte: currentMonthStart, $lte: currentMonthEnd },
      }),
      Blogs.find({
        publishedAt: { $gte: previousMonthStart, $lte: previousMonthEnd },
      }),
    ]);

    // Calculate blog traffic
    const blogTraffic = blogs.reduce((sum, blog) => sum + (blog.views || 0), 0);
    const previousMonthBlogTraffic = previousMonthBlogs.reduce(
      (sum, blog) => sum + (blog.views || 0),
      0,
    );

    // 6. Monthly Revenue - calculate using subscription tiers
    // Only count users whose subscription.tier is 'tier2' or 'tier3' and exclude admin users
    // Count active tier2/tier3 users by resolving tier from `subscription.tier` or top-level `tier`
    const currentRevenueDocs = await User.aggregate([
      {
        $addFields: {
          tierValue: { $ifNull: ["$subscription.tier", "$tier"] },
        },
      },
      {
        $match: {
          tierValue: { $in: ["tier2", "tier3"] },
          tier: { $ne: "admin" },
          $or: [
            { "subscription.status": "active" },
            { "subscription.status": { $exists: false } },
          ],
        },
      },
      {
        $group: {
          _id: null,
          revenue: {
            $sum: {
              $switch: {
                branches: [
                  { case: { $eq: ["$tierValue", "tier2"] }, then: 4.99 },
                  { case: { $eq: ["$tierValue", "tier3"] }, then: 9.99 },
                ],
                default: 0,
              },
            },
          },
          tier2Count: {
            $sum: { $cond: [{ $eq: ["$tierValue", "tier2"] }, 1, 0] },
          },
          tier3Count: {
            $sum: { $cond: [{ $eq: ["$tierValue", "tier3"] }, 1, 0] },
          },
        },
      },
    ]);

    const previousRevenueDocs = await User.aggregate([
      {
        $addFields: {
          tierValue: { $ifNull: ["$subscription.tier", "$tier"] },
        },
      },
      {
        $match: {
          tierValue: { $in: ["tier2", "tier3"] },
          tier: { $ne: "admin" },
          $or: [
            { "subscription.status": "active" },
            { "subscription.status": { $exists: false } },
          ],
        },
      },
      {
        $group: {
          _id: null,
          revenue: {
            $sum: {
              $switch: {
                branches: [
                  { case: { $eq: ["$tierValue", "tier2"] }, then: 4.99 },
                  { case: { $eq: ["$tierValue", "tier3"] }, then: 9.99 },
                ],
                default: 0,
              },
            },
          },
          tier2Count: {
            $sum: { $cond: [{ $eq: ["$tierValue", "tier2"] }, 1, 0] },
          },
          tier3Count: {
            $sum: { $cond: [{ $eq: ["$tierValue", "tier3"] }, 1, 0] },
          },
        },
      },
    ]);

    const monthlyRevenue =
      currentRevenueDocs &&
      currentRevenueDocs[0] &&
      currentRevenueDocs[0].revenue
        ? currentRevenueDocs[0].revenue
        : 0;
    const previousMonthRevenue =
      previousRevenueDocs &&
      previousRevenueDocs[0] &&
      previousRevenueDocs[0].revenue
        ? previousRevenueDocs[0].revenue
        : 0;

    // Ensure we preserve cents (do not round to integer). Keep exactly two decimal places.
    const monthlyRevenueFixed = Number(Number(monthlyRevenue).toFixed(2));
    const previousMonthRevenueFixed = Number(
      Number(previousMonthRevenue).toFixed(2),
    );

    // Format the stats
    const stats = {
      totalUsers: {
        value: totalUsers,
        growth: calculateGrowth(totalUsers, previousMonthUsers),
        formatted: totalUsers.toLocaleString(),
      },
      activeSubscribers: {
        value: activeSubscribers,
        growth: calculateGrowth(activeSubscribers, previousMonthSubscribers),
        formatted: activeSubscribers.toLocaleString(),
      },
      monthlyRevenue: {
        value: monthlyRevenueFixed,
        growth: calculateGrowth(monthlyRevenueFixed, previousMonthRevenueFixed),
        formatted: new Intl.NumberFormat("en-CA", {
          style: "currency",
          currency: "CAD",
        }).format(monthlyRevenueFixed),
      },
      instacartClicks: {
        value: instacartClicks,
        growth: calculateGrowth(instacartClicks, previousMonthInstacartClicks),
        formatted: instacartClicks.toLocaleString(),
      },
      mealPlansGenerated: {
        value: mealPlansGenerated,
        growth: calculateGrowth(mealPlansGenerated, previousMonthMealPlans),
        formatted: mealPlansGenerated.toLocaleString(),
      },
      blogTraffic: {
        value: blogTraffic,
        growth: calculateGrowth(blogTraffic, previousMonthBlogTraffic),
        formatted: blogTraffic.toLocaleString(),
      },
      lastUpdated: new Date().toISOString(),
      period: {
        currentMonth: currentMonthStart.toLocaleString("default", {
          month: "long",
          year: "numeric",
        }),
        previousMonth: previousMonthStart.toLocaleString("default", {
          month: "long",
          year: "numeric",
        }),
      },
      user: {
        name: authResult.userName,
        email: authResult.userEmail,
        tier: authResult.userTier,
      },
    };

    return NextResponse.json({
      success: true,
      message: "Dashboard stats fetched successfully",
      data: stats,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch dashboard stats",
        message: error.message,
      },
      { status: 500 },
    );
  }
}
