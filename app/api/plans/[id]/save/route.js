import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Plan from "@/models/Plan";
import User from "@/models/User";
import { authenticate } from "@/middleware/auth";

const SWAPS_PER_PLAN = {
  free: 1,
  tier2: 2,
  tier3: 3,
};

export async function POST(request, { params }) {
  try {
    await connectDB();
    const { id } = await params;

    let body;
    try {
      body = await request.json();
      // console.log("Save request body:", JSON.stringify(body).substring(0, 200));
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError.message);
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }
    // Get plan data
    const planData = body.planData || body.plan || body || {};
    const userId = body.userId || planData.userId;
    const userEmail = body.userEmail || planData.userEmail;
    const userTier = body.userTier || planData.tier || "free";

    // Validate user
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const actualUserTier = user.tier || "free";

    // Validate
    // if (actualUserTier === "free") {
    //   return NextResponse.json(
    //     {
    //       error:
    //         "Free users cannot save meal plans. Upgrade to Plus or Premium to save plans.",
    //       requiresUpgrade: true,
    //       tier: actualUserTier,
    //     },
    //     { status: 403 }
    //   );
    // }
    if (
      !planData.days ||
      !Array.isArray(planData.days) ||
      planData.days.length === 0
    ) {
      return NextResponse.json(
        { error: "Invalid plan data: missing or empty days array" },
        { status: 400 },
      );
    }

    await connectDB();

    // Check if this is a temp plan or updating an existing saved plan
    let savedPlan;
    let isNewPlan = id.startsWith("temp_");

    if (isNewPlan) {
      // Create NEW plan from temp plan
      savedPlan = new Plan({
        title: planData.title || "My Meal Plan",
        days: normalizeDays(planData.days),
        inputs: planData.inputs || {},
        source: planData.source || "openai",
        swapsAllowed:
          planData.swaps?.allowed || SWAPS_PER_PLAN[actualUserTier] || 1,
        swapsUsed: planData.swaps?.used || 0,
        isSaved: true,
        savedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        userId: userId,
        userEmail: userEmail,
        tier: actualUserTier,
      });
    } else {
      // UPDATE existing saved plan
      savedPlan = await Plan.findById(id);

      if (!savedPlan) {
        return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      }

      // Check ownership
      if (savedPlan.userId.toString() !== userId.toString()) {
        return NextResponse.json(
          { error: "Not authorized to update this plan" },
          { status: 403 },
        );
      }

      // Update the existing plan
      savedPlan.days = normalizeDays(planData.days);
      savedPlan.title = planData.title || savedPlan.title;
      savedPlan.swapsUsed = planData.swaps?.used || savedPlan.swapsUsed;
      savedPlan.swapsAllowed =
        planData.swaps?.allowed || savedPlan.swapsAllowed;
      savedPlan.isSaved = true;
      savedPlan.savedAt = new Date();
      savedPlan.updatedAt = new Date();
    }

    // Save to database
    await savedPlan.save();

    return NextResponse.json({
      success: true,
      message: isNewPlan
        ? "Plan saved successfully!"
        : "Plan updated successfully!",
      plan: {
        id: savedPlan._id,
        title: savedPlan.title,
        userId: savedPlan.userId,
        userEmail: savedPlan.userEmail,
        tier: savedPlan.tier,
        swapsAllowed: savedPlan.swapsAllowed,
        swapsUsed: savedPlan.swapsUsed,
        expiresAt: savedPlan.expiresAt,
        isSaved: true,
        days: savedPlan.days,
      },
      isNew: isNewPlan,
    });
  } catch (error) {
    console.error("Save error:", error);
    return NextResponse.json(
      { error: "Failed to save plan: " + error.message },
      { status: 500 },
    );
  }
}

// Helper function to normalize days structure
function normalizeDays(days) {
  if (!Array.isArray(days)) return [];

  return days.map((day, index) => ({
    dayIndex: day.dayIndex !== undefined ? day.dayIndex : index,
    meals: Array.isArray(day.meals)
      ? day.meals.map((meal) => ({
          mealType: meal.mealType || "meal",
          recipeName: meal.recipeName || "Unnamed Recipe",
          ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
          cookingTime: meal.cookingTime || 30,
          instructions: Array.isArray(meal.instructions)
            ? meal.instructions
            : [],
          recipeSource: meal.recipeSource || "openai",
          isSwapped: meal.isSwapped || false,
          originalRecipe: meal.originalRecipe || null,
          nutrition: meal.nutrition || {},
          ...meal,
        }))
      : [],
  }));
}
