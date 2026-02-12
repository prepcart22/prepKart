import { NextResponse } from "next/server";
import { generateMealPlan } from "@/lib/openai";
import { generateSpoonacularMealPlan } from "@/lib/spoonacular";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

// Monthly plan limits
const MONTHLY_PLAN_LIMITS = {
  free: 1, // Free: 1 plan per month
  tier2: 10, // Plus: 10 plans per month
  tier3: 25, // Premium: 25 plans per month
  admin: 999, // Admin: unlimited
};
// quick plan
const QUICK_PLAN_PRESETS = {
  vegetarian: {
    days_count: 3,
    meals_per_day: 3,
    cuisine: "any",
    dietaryPreferences: ["Vegetarian"],
    max_cooking_time: 30,
    goal: "Healthy Eating",
    portions: 2,
  },
  lowCarb: {
    days_count: 3,
    meals_per_day: 3,
    cuisine: "any",
    dietaryPreferences: ["Low-Carb"],
    max_cooking_time: 25,
    goal: "Weight Loss",
    portions: 2,
  },
  budget: {
    days_count: 3,
    meals_per_day: 2,
    cuisine: "any",
    max_cooking_time: 20,
    goal: "Budget Friendly",
    portions: 2,
  },
  quick: {
    days_count: 3,
    meals_per_day: 3,
    cuisine: "any",
    max_cooking_time: 15,
    goal: "Quick Meals",
    portions: 2,
  },
  family: {
    days_count: 3,
    meals_per_day: 3,
    cuisine: "any",
    max_cooking_time: 25,
    goal: "Family Friendly",
    portions: 4,
  },
  gourmet: {
    days_count: 3,
    meals_per_day: 3,
    cuisine: "any",
    max_cooking_time: 45,
    goal: "Gourmet",
    portions: 2,
  },
  halal: {
    days_count: 3,
    meals_per_day: 3,
    cuisine: "Middle Eastern",
    dietaryPreferences: ["Halal"],
    max_cooking_time: 30,
    goal: "Healthy Eating",
    portions: 2,
  },
  keto: {
    days_count: 3,
    meals_per_day: 3,
    cuisine: "any",
    dietaryPreferences: ["Keto"],
    max_cooking_time: 25,
    goal: "Weight Loss",
    portions: 2,
  },
  highProtein: {
    days_count: 3,
    meals_per_day: 3,
    cuisine: "any",
    dietaryPreferences: ["High-Protein"],
    max_cooking_time: 30,
    goal: "Muscle Gain",
    portions: 2,
  },
  mediterranean: {
    days_count: 3,
    meals_per_day: 3,
    cuisine: "Mediterranean",
    dietaryPreferences: ["Mediterranean"],
    max_cooking_time: 30,
    goal: "Healthy Eating",
    portions: 2,
  },
  detox: {
    days_count: 3,
    meals_per_day: 3,
    cuisine: "any",
    dietaryPreferences: ["Vegetarian", "Dairy-Free"],
    max_cooking_time: 20,
    goal: "Detox",
    portions: 2,
  },
  weightLoss: {
    days_count: 3,
    meals_per_day: 3,
    cuisine: "any",
    dietaryPreferences: ["Low-Carb", "Low-Fat"],
    max_cooking_time: 25,
    goal: "Weight Loss",
    portions: 2,
  },
  glutenFree: {
    days_count: 3,
    meals_per_day: 3,
    cuisine: "any",
    dietaryPreferences: ["Gluten-Free"],
    max_cooking_time: 30,
    goal: "Healthy Eating",
    portions: 2,
  },

  vegan: {
    days_count: 3,
    meals_per_day: 3,
    cuisine: "any",
    dietaryPreferences: ["Vegan"],
    max_cooking_time: 30,
    goal: "Healthy Eating",
    portions: 2,
  },

  familyFriendly: {
    days_count: 3,
    meals_per_day: 3,
    cuisine: "any",
    max_cooking_time: 25,
    goal: "Family Friendly",
    portions: 4,
  },

  budgetFriendly: {
    days_count: 3,
    meals_per_day: 2,
    cuisine: "any",
    max_cooking_time: 20,
    goal: "Budget Friendly",
    portions: 2,
  },
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { planType, userTier, locale, daysCount = 3, userId } = body;

    if (!planType) {
      console.error("No planType provided");
      return NextResponse.json(
        { error: "planType is required" },
        { status: 400 },
      );
    }

    // ========== MONTHLY PLAN LIMIT CHECK ==========
    if (userId && userTier !== "tier3") {
      await connectDB();
      const user = await User.findById(userId);

      if (user) {
        const monthlyLimit = MONTHLY_PLAN_LIMITS[userTier] || 1;
        const planCountThisMonth = user.monthly_plan_count || 0;

        // console.log(
        //   `User ${userId} (${userTier}): ${planCountThisMonth}/${monthlyLimit} plans used`,
        // );

        if (planCountThisMonth >= monthlyLimit) {
          return NextResponse.json(
            {
              error: "Monthly limit reached",
              message: `You have reached your monthly limit of ${monthlyLimit} plans. ${
                userTier === "free"
                  ? "Upgrade to Plus or Premium for more plans."
                  : "Upgrade to Premium for unlimited plans."
              }`,
              limit: monthlyLimit,
              used: planCountThisMonth,
              tier: userTier,
            },
            { status: 403 },
          );
        }
      }
    }
    // ========== END MONTHLY PLAN LIMIT CHECK ==========
    if (!QUICK_PLAN_PRESETS[planType]) {
      console.error(`Invalid planType: ${planType}`);
      return NextResponse.json(
        {
          error: `Invalid plan type: ${planType}. Valid types: ${Object.keys(
            QUICK_PLAN_PRESETS,
          ).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const basePreset = QUICK_PLAN_PRESETS[planType];
    const preset = {
      ...basePreset,
      days_count: daysCount,
      daysCount: daysCount,
    };

    // console.log(
    //   `Generating ${daysCount}-day ${planType} plan for user ${userId || "guest"}`,
    // );

    let planData;
    // Generate based on user tier
    if (userTier === "free") {
      try {
        planData = await generateMealPlan(preset, "free");
        planData._tier = "free";
        planData._message = "Upgrade for better recipes and grocery lists";
      } catch (openaiError) {
        console.error("OpenAI error:", openaiError);
        throw new Error(`OpenAI generation failed: ${openaiError.message}`);
      }
    } else if (userTier === "tier2" || userTier === "tier3") {
      try {
        planData = await generateSpoonacularMealPlan(preset, userTier);
        planData._tier = userTier;
        planData._message = "Premium plan generated";
      } catch (spoonacularError) {
        console.error("Spoonacular failed:", spoonacularError);
        // Fallback to OpenAI
        planData = await generateMealPlan(preset, userTier);
        planData._tier = userTier;
        planData._message = "Premium plan (fallback)";
      }
    } else {
      planData = await generateMealPlan(preset, "free");
      planData._tier = "guest";
      planData._message = "Sign up for personalized plans";
    }

    return NextResponse.json(planData);
  } catch (error) {
    console.error("Quick plan API error:", error);

    // Return a fallback plan
    // const fallbackPlan = {
    //   days: [
    //     {
    //       dayIndex: 1,
    //       dayName: "Monday",
    //       meals: [
    //         {
    //           mealType: "breakfast",
    //           recipeName: "Quick Oatmeal",
    //           ingredients: [
    //             { name: "rolled oats", quantity: 1, unit: "cup" },
    //             { name: "milk", quantity: 1, unit: "cup" },
    //             { name: "honey", quantity: 1, unit: "tablespoon" },
    //           ],
    //           cookingTime: 10,
    //           instructions: [
    //             "Mix oats and milk",
    //             "Microwave for 2 minutes",
    //             "Add honey",
    //           ],
    //           recipeSource: "fallback",
    //         },
    //         {
    //           mealType: "lunch",
    //           recipeName: "Simple Sandwich",
    //           ingredients: [
    //             { name: "bread", quantity: 2, unit: "slices" },
    //             { name: "turkey", quantity: 100, unit: "grams" },
    //             { name: "lettuce", quantity: 2, unit: "leaves" },
    //           ],
    //           cookingTime: 5,
    //           instructions: [
    //             "Assemble ingredients between bread slices",
    //             "Serve",
    //           ],
    //           recipeSource: "fallback",
    //         },
    //       ],
    //     },
    //   ],
    //   _tier: "fallback",
    //   _message: "Using fallback plan",
    // };

    return NextResponse.json(
      {
        error: error.message || "Failed to generate meal plan",
        message: "Please try again later",
      },
      { status: 500 },
    );
  }
}
