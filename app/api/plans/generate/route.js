import { openai } from "@/lib/openai";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Plan from "@/models/Plan";
import { generateMealPlan } from "@/lib/openai";
import { authenticate } from "@/middleware/auth";
import { extractPrimaryProtein, extractBaseCarb } from "@/lib/hybridUtils";

// TIER CONFIGURATION
const TIER_CONFIG = {
  free: {
    name: "Free",
    monthlyPlans: 1,
    swapsPerPlan: 0,
    generationMethod: "openai", // Free users get OpenAI only
    canSave: false,
    hasPantry: false,
    hasHistory: false,
    hasDashboard: false,
    customRecipes: false,
    requiresLogin: true,
    nutritionValidation: false, // Free users don't get Spoonacular validation
  },
  tier2: {
    name: "Plus",
    monthlyPlans: 10,
    swapsPerPlan: 2,
    generationMethod: "hybrid", // Plus users get hybrid
    canSave: true,
    hasPantry: true,
    hasHistory: true,
    hasDashboard: true,
    customRecipes: true,
    requiresLogin: true,
    nutritionValidation: true, // Plus users get validation
  },
  tier3: {
    name: "Premium",
    monthlyPlans: 25,
    swapsPerPlan: 3,
    generationMethod: "hybrid", // Premium users get hybrid
    canSave: true,
    hasPantry: true,
    hasHistory: true,
    hasDashboard: true,
    customRecipes: true,
    premiumRecipes: true,
    requiresLogin: true,
    nutritionValidation: true, // Premium users get validation
  },
};

// Get user's actual tier
async function getUserActualTier(userId) {
  if (!userId) return "free";
  try {
    const user = await User.findById(userId).select("tier subscription");
    if (!user) return "free";

    const tier = user.subscription?.tier || user.tier;
    const validTiers = ["free", "tier2", "tier3"];

    if (tier && validTiers.includes(tier)) {
      return tier;
    }

    return "free";
  } catch (error) {
    console.error("Error getting user tier:", error);
    return "free";
  }
}

// Check if user can generate plan
async function canUserGeneratePlan(userId, userTier) {
  if (!userId) {
    return {
      allowed: false,
      message: "Login required to generate meal plans",
      requiresLogin: true,
    };
  }

  const user = await User.findById(userId);
  if (!user) {
    return {
      allowed: false,
      message: "User not found",
    };
  }

  const tierConfig = TIER_CONFIG[userTier] || TIER_CONFIG.free;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Reset monthly count if needed
  if (!user.last_plan_date || new Date(user.last_plan_date) < startOfMonth) {
    user.monthly_plan_count = 0;
    user.last_plan_date = now;
    await user.save();
  }

  const plansThisMonth = user.monthly_plan_count || 0;

  // Check limits
  if (plansThisMonth >= tierConfig.monthlyPlans) {
    return {
      allowed: false,
      message:
        userTier === "free"
          ? "Free users can generate only 1 meal plan per month. Upgrade to Plus or Premium for more!"
          : `You have reached your ${tierConfig.name} limit of ${tierConfig.monthlyPlans} plans per month.`,
      limitReached: true,
      requiresUpgrade: userTier === "free" || userTier === "tier2",
      plansUsed: plansThisMonth,
      plansAllowed: tierConfig.monthlyPlans,
    };
  }

  return {
    allowed: true,
    message: `You have ${
      tierConfig.monthlyPlans - plansThisMonth
    } plans remaining this month`,
    plansUsed: plansThisMonth,
    plansAllowed: tierConfig.monthlyPlans,
    remaining: tierConfig.monthlyPlans - plansThisMonth,
  };
}

// Get user's recipe history for deduplication
async function getUserRecipeHistory(userId, days = 14) {
  try {
    const recentPlans = await Plan.find({
      userId: userId,
      createdAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    })
      .sort({ createdAt: -1 })
      .limit(5);

    const history = [];
    recentPlans.forEach((plan) => {
      plan.days?.forEach((day) => {
        day.meals?.forEach((meal) => {
          history.push({
            title: meal.recipeName,
            ingredients: meal.ingredients || [],
            cuisine: meal.cuisine || [],
            dateUsed: plan.createdAt,
            primaryProtein: extractPrimaryProtein(meal.ingredients || []),
            baseCarb: extractBaseCarb(meal.ingredients || []),
          });
        });
      });
    });

    return history;
  } catch (error) {
    console.error("Error fetching recipe history:", error);
    return [];
  }
}

// Generate single hybrid recipe
async function generateHybridRecipe(inputs, constraints, userInfo) {
  const {
    mealType,
    cuisine,
    dietaryPreferences = [],
    maxCookingTime = 45,
    servings = inputs.portions || 2,
    province = inputs.province || "Ontario",
    cookingMethod = inputs.cooking_method || "grill",
  } = constraints;

  // Build a simpler prompt
  const prompt = `Create a vegan ${mealType} recipe for muscle gain.
Cuisine: ${cuisine || "Asian"}
Cooking method: ${cookingMethod}
Max time: ${maxCookingTime} minutes
Servings: ${servings}
Location: ${province}

Return ONLY JSON with this exact format:
{
  "title": "Recipe Name",
  "ingredients": [
    {"name": "Tofu", "quantity": 200, "unit": "grams"}
  ],
  "cookingTime": 30,
  "instructions": ["Step 1", "Step 2"],
  "nutrition": {"calories": 450, "protein_g": 25, "carbs_g": 50, "fat_g": 12}
}`;

  try {
    console.log(`Generating ${mealType} with GPT-5-nano...`);
    const startTime = Date.now();

    const response = await openai.responses.create({
      model: "gpt-5-nano",
      input: prompt,
      max_output_tokens: 8000,
    });

    // console.log(`GPT-5-nano took ${Date.now() - startTime}ms`);

    // DEBUG: Log the actual response structure
    // console.log("DEBUG - Response keys:", Object.keys(response));
    // console.log("DEBUG - Response.text type:", typeof response.text);
    // console.log("DEBUG - Response.text value:", response.text);

    let content = "";

    // Check if text is a string
    if (response.text && typeof response.text === "string") {
      content = response.text.trim();
      // console.log("Found string in response.text:", content.substring(0, 100));
    }
    // Check if text is an object with string content
    else if (response.text && typeof response.text === "object") {
      // console.log(
      //   "response.text is object, checking structure:",
      //   response.text,
      // );
      // Try to extract string from object
      if (Array.isArray(response.text)) {
        // If it's an array, join all string elements
        content = response.text
          .filter((item) => typeof item === "string")
          .join(" ")
          .trim();
        // console.log("Extracted from text array:", content.substring(0, 100));
      } else if (
        response.text.content &&
        typeof response.text.content === "string"
      ) {
        content = response.text.content.trim();
        // console.log("Found content in text object:", content.substring(0, 100));
      }
    }

    // Check output array (correct structure)
    if (!content && response.output && Array.isArray(response.output)) {
      // console.log("Checking output array structure...");
      for (const item of response.output) {
        // console.log("Output item type:", item.type);

        // FIX: GPT-5-nano returns output items with 'text' as string
        if (
          item.type === "text" &&
          item.text &&
          typeof item.text === "string"
        ) {
          content = item.text.trim();
          // console.log("Found text in output item:", content.substring(0, 100));
          break;
        }

        // might be in content array
        if (item.content && Array.isArray(item.content)) {
          for (const contentItem of item.content) {
            if (
              contentItem.type === "text" &&
              contentItem.text &&
              typeof contentItem.text === "string"
            ) {
              content = contentItem.text.trim();
              // console.log(
              //   "Found text in content array:",
              //   content.substring(0, 100),
              // );
              break;
            }
          }
          if (content) break;
        }
      }
    }

    // Check output_text (if it exists)
    if (
      !content &&
      response.output_text &&
      typeof response.output_text === "string"
    ) {
      content = response.output_text.trim();
      // console.log("Found output_text:", content.substring(0, 100));
    }

    if (!content) {
      // console.log("ERROR: No extractable content found");
      // console.log(
      //   "Full response structure:",
      //   JSON.stringify(response, null, 2).substring(0, 1000),
      // );
      throw new Error("No content in response");
    }

    // console.log(
    //   "Extracted content (first 200 chars):",
    //   content.substring(0, 200),
    // );

    // Clean and extract JSON
    content = content.trim();

    // Remove markdown code blocks
    content = content
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();

    // Extract JSON if wrapped in text
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      content = jsonMatch[0];
    }

    // console.log("JSON to parse (first 200 chars):", content.substring(0, 200));

    // Parse JSON
    let recipeData;
    try {
      recipeData = JSON.parse(content);
    } catch (parseError) {
      console.error("JSON parse error:", parseError.message);
      console.error("Content that failed:", content);

      // Try to fix common JSON issues
      let fixedContent = content
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/'/g, '"');

      try {
        recipeData = JSON.parse(fixedContent);
        console.log("Fixed JSON successfully");
      } catch (fixError) {
        console.error("Could not fix JSON:", fixError.message);
        throw new Error("Invalid JSON response from AI");
      }
    }

    // Validate recipe
    if (!recipeData.title || !Array.isArray(recipeData.ingredients)) {
      console.error("Invalid recipe structure:", recipeData);
      throw new Error("Invalid recipe structure");
    }

    console.log(`Generated: ${recipeData.title}`);

    // Return formatted recipe
    return {
      mealType: mealType,
      recipeName: recipeData.title,
      ingredients: recipeData.ingredients.map((ing) => ({
        name: ing.name || "Ingredient",
        quantity: ing.quantity || 1,
        unit: ing.unit || "unit",
      })),
      cookingTime: recipeData.cookingTime || 30,
      instructions: Array.isArray(recipeData.instructions)
        ? recipeData.instructions
        : ["Prepare ingredients", "Cook", "Serve"],
      recipeSource: "hybrid",
      nutrition: recipeData.nutrition || {
        calories: 450,
        protein_g: 25,
        carbs_g: 50,
        fat_g: 12,
      },
      cuisine: cuisine ? [cuisine] : ["Asian"],
      tags: ["vegan", "high-protein", "muscle-gain"],
    };
  } catch (error) {
    console.error("Recipe generation failed:", error.message);
    // Don't use fallback - throw the error so we can see what's wrong
    throw error;
  }
}
// Helper function for fallback recipes
function createFallbackRecipe(constraints) {
  const {
    mealType,
    cuisine = "Asian",
    servings = 2,
    cookingMethod = "grill",
  } = constraints;

  const veganProteins = ["Tofu", "Tempeh", "Lentils", "Chickpeas", "Edamame"];
  const protein =
    veganProteins[Math.floor(Math.random() * veganProteins.length)];

  return {
    mealType,
    recipeName: `${cuisine} ${protein} ${cookingMethod} ${mealType}`,
    ingredients: [
      { name: protein, quantity: servings * 150, unit: "grams" },
      { name: "Mixed Vegetables", quantity: 2, unit: "cups" },
      { name: "Quinoa", quantity: 1, unit: "cup" },
    ],
    cookingTime: 35,
    instructions: [
      `Marinate ${protein} with spices`,
      `Preheat ${cookingMethod}`,
      `Cook ${protein} for 15-20 minutes`,
      "Steam vegetables",
      "Serve with quinoa",
    ],
    recipeSource: "fallback",
    nutrition: {
      calories: 480,
      protein_g: 28,
      carbs_g: 55,
      fat_g: 10,
    },
    cuisine: [cuisine],
    tags: ["vegan", "high-protein", cookingMethod],
  };
}

function createFallbackMeal(mealType, inputs) {
  const cuisine = inputs.cuisine || "any";
  const maxCookingTime = parseInt(inputs.max_cooking_time) || 30;
  const dietaryPreferences = inputs.dietaryPreferences || [];
  const allergies = inputs.allergies || [];

  const cuisinePrefix =
    cuisine === "any"
      ? ""
      : `${cuisine.charAt(0).toUpperCase() + cuisine.slice(1)} `;

  // Simple fallback meals - NO external function calls
  let baseMeal;

  if (
    dietaryPreferences.includes("Vegan") ||
    dietaryPreferences.includes("vegan")
  ) {
    // Vegan fallback
    baseMeal = {
      recipeName: `${cuisinePrefix}Vegan ${mealType}`,
      ingredients: [
        { name: "Tofu", quantity: 1, unit: "block" },
        { name: "Mixed Vegetables", quantity: 2, unit: "cups" },
        { name: "Brown Rice", quantity: 1, unit: "cup" },
      ],
      cookingTime: Math.min(25, maxCookingTime),
      instructions: [
        "Prepare tofu and vegetables",
        "Cook according to recipe",
        "Serve with rice",
      ],
    };
  } else if (
    dietaryPreferences.includes("Vegetarian") ||
    dietaryPreferences.includes("vegetarian")
  ) {
    // Vegetarian fallback
    baseMeal = {
      recipeName: `${cuisinePrefix}Vegetarian ${mealType}`,
      ingredients: [
        { name: "Paneer", quantity: 200, unit: "grams" },
        { name: "Vegetables", quantity: 2, unit: "cups" },
        { name: "Naan", quantity: 2, unit: "pieces" },
      ],
      cookingTime: Math.min(30, maxCookingTime),
      instructions: ["Prepare ingredients", "Cook as desired", "Serve hot"],
    };
  } else {
    // Standard fallback
    baseMeal = {
      recipeName: `${cuisinePrefix}${mealType}`,
      ingredients: [
        { name: "Protein", quantity: 1, unit: "serving" },
        { name: "Vegetables", quantity: 2, unit: "cups" },
        { name: "Grains", quantity: 1, unit: "cup" },
      ],
      cookingTime: Math.min(25, maxCookingTime),
      instructions: [
        "Prepare all ingredients",
        "Cook according to preference",
        "Serve and enjoy",
      ],
    };
  }

  // Filter out allergens (simple check)
  const safeIngredients = baseMeal.ingredients.filter((ingredient) => {
    if (!allergies.length) return true;
    const ingName = ingredient.name.toLowerCase();
    return !allergies.some((allergy) =>
      ingName.includes(allergy.toLowerCase()),
    );
  });

  return {
    mealType: mealType,
    recipeName: baseMeal.recipeName,
    ingredients:
      safeIngredients.length > 0 ? safeIngredients : baseMeal.ingredients,
    cookingTime: baseMeal.cookingTime,
    instructions: baseMeal.instructions,
    recipeSource: "openai-fallback",
    notes: "Created with your preferences in mind",
  };
}

function getMealTypeForIndex(index, totalMeals) {
  const types = ["breakfast", "lunch", "dinner", "snack"];
  if (totalMeals === 1) return "lunch";
  if (totalMeals === 2) return index === 0 ? "lunch" : "dinner";
  return types[index] || "lunch";
}

function getCalorieTarget(goal, mealType) {
  const base = {
    "Muscle Gain": { breakfast: 500, lunch: 600, dinner: 600, snack: 200 },
    "Weight Loss": { breakfast: 300, lunch: 400, dinner: 400, snack: 100 },
    default: { breakfast: 400, lunch: 500, dinner: 500, snack: 150 },
  };

  const targets = base[goal] || base.default;
  const cal = targets[mealType] || targets.lunch;

  return { min: Math.round(cal * 0.8), max: Math.round(cal * 1.2) };
}

function getProteinTarget(goal, mealType) {
  const base = {
    "Muscle Gain": { breakfast: 30, lunch: 35, dinner: 35, snack: 10 },
    "Weight Loss": { breakfast: 20, lunch: 25, dinner: 25, snack: 5 },
    default: { breakfast: 20, lunch: 25, dinner: 25, snack: 5 },
  };

  const targets = base[goal] || base.default;
  const prot = targets[mealType] || targets.lunch;

  return { min: Math.round(prot * 0.8), max: Math.round(prot * 1.2) };
}

// Generate hybrid meal plan
async function generateHybridMealPlan(inputs, userTier, userInfo) {
  const daysCount = Math.min(parseInt(inputs.days_count) || 3, 7);
  const mealsPerDay = Math.min(parseInt(inputs.meals_per_day) || 1, 4);

  // console.log(
  //   `Hybrid plan: ${daysCount} days, ${mealsPerDay} meals/day - GENERATING ALL AT ONCE`,
  // );

  // Build ONE prompt for ALL meals
  const prompt = `Generate ${daysCount} vegan lunch recipes for muscle gain.
  
REQUIREMENTS FOR ALL RECIPES:
- Cuisine: ${inputs.cuisine || "Asian"}
- Cooking method: ${inputs.cooking_method || "grill"}
- Max cooking time: ${inputs.max_cooking_time || 45} minutes
- Servings: ${inputs.portions || 2}
- Location: ${inputs.province || "Ontario"}
- Must be: High protein, vegan, for muscle gain
- Each recipe must be DIFFERENT

Return ONLY JSON array with ${daysCount} recipes in this exact format:
[
  {
    "title": "Recipe 1 Name",
    "ingredients": [
      {"name": "Tofu", "quantity": 200, "unit": "grams"}
    ],
    "cookingTime": 30,
    "instructions": ["Step 1", "Step 2", "Step 3"],
    "nutrition": {"calories": 450, "protein_g": 25, "carbs_g": 50, "fat_g": 12}
  }
]`;

  try {
    // console.log("Generating ALL recipes at once with GPT-5-nano...");
    const startTime = Date.now();

    const response = await openai.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        {
          role: "system",
          content:
            "You are a vegan chef. Return ONLY valid JSON array. No explanations.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_completion_tokens: 2000, // Enough for all recipes
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    // console.log(`BATCH generation took ${Date.now() - startTime}ms`);

    const content = response.choices[0].message.content;
    // console.log("Raw response length:", content.length);

    // Parse the response
    let recipesData;
    try {
      const parsed = JSON.parse(content);
      // Check if it's an array or object with array
      recipesData = Array.isArray(parsed)
        ? parsed
        : parsed.recipes || parsed.data || [];
    } catch (parseError) {
      console.error("JSON parse error:", parseError.message);
      // Try to extract array from text
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          recipesData = JSON.parse(arrayMatch[0]);
        } catch (e) {
          throw new Error("Cannot parse recipes");
        }
      } else {
        throw new Error("No recipes array found");
      }
    }

    if (!Array.isArray(recipesData) || recipesData.length === 0) {
      throw new Error("No valid recipes generated");
    }

    console.log(`Generated ${recipesData.length} recipes at once`);

    // Build days from recipes
    const days = [];
    const dayNames = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];

    for (let day = 0; day < daysCount; day++) {
      const recipeIndex = day % recipesData.length;
      const recipeData = recipesData[recipeIndex];

      // Format each recipe
      const recipe = {
        mealType: "lunch", // Since you only want 1 meal/day
        recipeName:
          recipeData.title ||
          `${inputs.cuisine || "Asian"} Vegan Lunch ${day + 1}`,
        ingredients: Array.isArray(recipeData.ingredients)
          ? recipeData.ingredients.map((ing) => ({
              name: ing.name || "Ingredient",
              quantity: ing.quantity || 1,
              unit: ing.unit || "unit",
            }))
          : [{ name: "Tofu", quantity: 200, unit: "grams" }],
        cookingTime: recipeData.cookingTime || 30,
        instructions: Array.isArray(recipeData.instructions)
          ? recipeData.instructions
          : ["Prepare ingredients", "Cook", "Serve"],
        recipeSource: "hybrid-batch",
        nutrition: recipeData.nutrition || {
          calories: 450,
          protein_g: 25,
          carbs_g: 50,
          fat_g: 12,
        },
        cuisine: inputs.cuisine ? [inputs.cuisine] : ["Asian"],
        tags: ["vegan", "high-protein", "muscle-gain"],
      };

      days.push({
        dayIndex: day + 1,
        dayName: dayNames[day % 7],
        meals: [recipe],
      });
    }

    console.log(`Built ${days.length} days from batch generation`);

    return {
      days,
      generationMethod: "hybrid-batch",
      nutritionValidationStatus: "complete",
    };
  } catch (error) {
    console.error("Batch generation failed:", error.message);

    // FALLBACK: Use your existing OpenAI meal plan function
    console.log("Falling back to OpenAI meal plan...");
    return await generateMealPlan(inputs, userTier);
  }
}

export async function POST(request) {
  const acceptLanguage = request.headers.get("accept-language");
  const locale = acceptLanguage?.startsWith("fr") ? "fr" : "en";

  try {
    await connectDB();

    // Parse inputs
    const inputs = await request.json();

    // Validate required fields
    if (!inputs.province || !inputs.goal) {
      return NextResponse.json(
        {
          error:
            locale === "fr"
              ? "La province et l'objectif sont requis"
              : "Province and goal are required",
          success: false,
        },
        { status: 400 },
      );
    }

    // Authentication
    const auth = await authenticate(request);
    let userId = null;
    let userEmail = null;

    if (auth.success && auth.userId) {
      userId = auth.userId;
      const user = await User.findById(userId).select("email name");
      userEmail = user?.email || null;
    }

    // Determine user tier
    const userTier = await getUserActualTier(userId);
    const config = TIER_CONFIG[userTier] || TIER_CONFIG.free;

    // Check if user can generate plan
    const generationCheck = await canUserGeneratePlan(userId, userTier);

    if (!generationCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: generationCheck.message,
          limitReached: generationCheck.limitReached || false,
          requiresLogin: generationCheck.requiresLogin || false,
          requiresUpgrade: generationCheck.requiresUpgrade || false,
          tier: userTier,
          tierName: config.name,
          plans: {
            used: generationCheck.plansUsed || 0,
            allowed: generationCheck.plansAllowed || 1,
            remaining: generationCheck.remaining || 0,
          },
        },
        { status: 200 },
      );
    }

    // Validate days count
    const daysCount = parseInt(inputs.days_count) || 7;
    if (daysCount < 1 || daysCount > 7) {
      return NextResponse.json(
        {
          error:
            locale === "fr"
              ? "Le nombre de jours doit être entre 1 et 7"
              : "Number of days must be between 1 and 7",
          success: false,
        },
        { status: 400 },
      );
    }

    // FORCE USE YOUR WORKING OPENAI FUNCTION
    console.log("Generating meal plan with working OpenAI function...");
    const planData = await generateMealPlan(
      {
        // Ensure all fields are properly formatted
        days_count: inputs.days_count || 3,
        meals_per_day: inputs.meals_per_day || 1,
        max_cooking_time: inputs.max_cooking_time || 45,
        cuisine: inputs.cuisine || "Asian",
        portions: inputs.portions || 2,
        goal: inputs.goal || "Muscle Gain",
        province: inputs.province || "Ontario",
        budgetLevel: inputs.budget_level || "Medium",
        likes: inputs.likes || "",
        dislikes: inputs.dislikes || "",
        cookingMethod: inputs.cooking_method || "",
        skillLevel: inputs.skill_level || "Beginner",
        dietaryPreferences: inputs.dietary_preferences || [],
        allergies: inputs.allergies || [],
      },
      userTier,
    );

    console.log("Meal plan generated successfully");

    // Save generated plan immediately for authenticated users as draft
    let savedPlan = null;
    if (userId) {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      savedPlan = await new Plan({
        title: `${inputs.goal} ${inputs.cuisine ? inputs.cuisine + " " : ""}Meal Plan`,
        days: planData.days || [],
        inputs,
        source: "openai",
        generationMethod: "openai",
        swapsAllowed: config.swapsPerPlan,
        swapsUsed: 0,
        isSaved: false,
        expiresAt,
        userId: String(userId),
        userEmail,
        tier: userTier,
      }).save();
    }

    // Generate temporary ID only for non-authenticated fallback
    const planId =
      savedPlan?._id?.toString() ||
      `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare response
    const planResponse = {
      id: planId,
      title: `${inputs.goal} ${
        inputs.cuisine ? inputs.cuisine + " " : ""
      }Meal Plan`,
      days: planData.days || [],
      swaps: {
        allowed: config.swapsPerPlan,
        used: 0,
        remaining: config.swapsPerPlan,
        enabled: config.swapsPerPlan > 0,
      },
      tier: userTier,
      tierName: config.name,
      isSaved: false,
      canBeSaved: config.canSave && !!userId,
      inputs: inputs,
      source: "openai",
      userId: userId,
      userEmail: userEmail,
      generationMethod: "openai",
      features: {
        canSave: config.canSave,
        hasPantry: config.hasPantry,
        hasHistory: config.hasHistory,
        hasDashboard: config.hasDashboard,
        customRecipes: config.customRecipes,
        premiumRecipes: config.premiumRecipes || false,
        swapsEnabled: config.swapsPerPlan > 0,
        nutritionValidation: config.nutritionValidation || false,
      },
      limits: {
        used: generationCheck.plansUsed + 1,
        total: generationCheck.plansAllowed,
        remaining: Math.max(
          0,
          generationCheck.plansAllowed - (generationCheck.plansUsed + 1),
        ),
      },
    };

    // Update user's monthly generation count
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        $inc: { monthly_plan_count: 1 },
        last_plan_date: new Date(),
      });
    }

    return NextResponse.json({
      success: true,
      plan: planResponse,
      tier: userTier,
      tierName: config.name,
      remainingPlans: Math.max(
        0,
        generationCheck.plansAllowed - (generationCheck.plansUsed + 1),
      ),
    });
  } catch (error) {
    console.error("Generate error:", error);
    return NextResponse.json(
      {
        error:
          locale === "fr"
            ? "Échec de la génération du plan: " + error.message
            : "Failed to generate plan: " + error.message,
        success: false,
      },
      { status: 500 },
    );
  }
}
