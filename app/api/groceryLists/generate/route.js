import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Plan from "@/models/Plan";
import GroceryList from "@/models/GroceryList";
import Pantry from "@/models/Pantry";
import User from "@/models/User";
import { authenticate } from "@/middleware/auth";
import {
  mapToAisle,
  normalizeIngredientName,
  sortByAisle,
} from "@/lib/aisleMapper";
import { generateInstacartLink } from "@/lib/instacart";

export async function POST(request) {
  try {
    await connectDB();

    // Authenticate user
    const auth = await authenticate(request);
    if (!auth.success) {
      return NextResponse.json(
        { error: "Please login to generate grocery lists" },
        { status: 401 },
      );
    }

    const { userId } = auth;

    // Get accurate user tier
    const user = await User.findById(userId).select("tier subscription");
    const userTier = user?.subscription?.tier || user?.tier || "free";
    const impactId = process.env.INSTACART_IMPACT_ID || "6899496";

    // ------------------ New block for new logic ------------------
    let canGenerate = true;
    let errorMessage = null;

    if (userTier === "admin") {
      // Admins: always allow, no limits
      canGenerate = true;
    } else if (userTier === "free") {
      // Free: 1 plan per month
      const lastPlan = user.last_plan_date;
      const isNewMonth =
        !lastPlan ||
        lastPlan.getMonth() !== new Date().getMonth() ||
        lastPlan.getFullYear() !== new Date().getFullYear();

      if (!isNewMonth && user.monthly_plan_count >= 1) {
        canGenerate = false;
        errorMessage =
          "You have reached your free plan limit (1 plan per month). Upgrade to Plus or Premium.";
      }
    } else if (userTier === "tier2") {
      // Plus: max 10 per month (your pricing page)
      if (user.monthly_plan_count >= 10) {
        canGenerate = false;
        errorMessage =
          "You have reached your Plus plan limit (10 plans/month). Upgrade to Premium for more plans.";
      }
    } else if (userTier === "tier3") {
      // Premium: unlimited → do nothing, allow
      // canGenerate = true;

      // Premium: max 25 per month (your pricing page)
      if (user.monthly_plan_count >= 25) {
        canGenerate = false;
        errorMessage =
          "You have reached your Premium plan limit (25 plans/month).";
      }
    }

    if (!canGenerate) {
      return NextResponse.json(
        {
          success: false,
          error: errorMessage || "Plan generation limit reached.",
          limitReached: true,
        },
        { status: 403 },
      );
    }
    // ----------------------------------------------------

    // Parse request body
    const body = await request.json();
    const { planId, pantryToggle = false, planData } = body;

    if (!planId) {
      return NextResponse.json(
        { error: "Plan ID is required" },
        { status: 400 },
      );
    }

    let plan;
    let isTemporaryPlan = false;

    // if (planId.startsWith("temp_")) {
    //   isTemporaryPlan = true;

    //   if (!planData) {
    //     return NextResponse.json(
    //       {
    //         error: "Plan data required for temporary plans",
    //       },
    //       { status: 400 },
    //     );
    //   }

    //   plan = planData;
    // }

    // New logic - user can only generate meal after saving the plan
    if (planId.startsWith("temp_")) {
      return NextResponse.json(
        {
          error: "Please save the plan first before generating a grocery list",
        },
        { status: 403 },
      );
    } else {
      // SAVED PLAN: Fetch from database
      plan = await Plan.findOne({
        $or: [{ _id: planId }, { id: planId }],
      });

      if (!plan) {
        return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      }

      // Check if user owns the plan
      if (plan.userId && plan.userId.toString() !== userId.toString()) {
        return NextResponse.json(
          { error: "Not authorized to access this plan" },
          { status: 403 },
        );
      }
    }

    // Check tier for pantry toggle
    if (pantryToggle && userTier === "free") {
      return NextResponse.json(
        { error: "Pantry toggle is only available for Plus and Premium users" },
        { status: 403 },
      );
    }

    // Extract all ingredients from plan
    const allIngredients = extractIngredientsFromPlan(plan);

    // Get user's pantry if toggle is enabled
    let pantryItems = [];
    if (pantryToggle) {
      const pantry = await Pantry.findOne({ userId });
      if (pantry) {
        pantryItems = pantry.items || [];
      }
    }

    // Process ingredients
    const groceryItems = processIngredients(
      allIngredients,
      pantryItems,
      pantryToggle,
      plan.days,
    );

    // Sort items by aisle
    const sortedItems = sortByAisle(groceryItems) || [];

    // Create grocery list
    const groceryListData = {
      userId,
      planTitle: plan.title || "Temporary Plan",
      title: `Grocery List - ${plan.title || "Temporary Plan"}`,
      items: sortedItems,
      pantryToggle,
      totalItems: sortedItems.length,
      estimatedTotal: calculateEstimatedTotal(sortedItems),
      currency: "CAD",
      storePreference: "Instacart",
      isActive: true,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    };

    // Only link to saved plans in database
    if (!isTemporaryPlan && plan._id) {
      groceryListData.planId = plan._id;
    } else {
      // For temp plans
      groceryListData.tempPlanId = planId;
      groceryListData.isTemporary = true;
    }

    const groceryList = await GroceryList.create(groceryListData);

    // for admin save plans
    await User.findByIdAndUpdate(userId, {
      $inc: {
        monthly_plan_count: 1,
        planGenerationCount: 1,
      },
      $set: {
        last_plan_date: new Date(),
        lastPlanGeneration: new Date(),
      },
    });
    // ──────────────────────────────────────────────────────────────

    // Generate Instacart deep link
    const itemsForInstacart = sortedItems.filter(
      (item) => item.checked === true,
    );
    const instacartLink = await generateInstacartLink(
      itemsForInstacart,
      userTier,
      impactId,
    );

    // console.log("Instacart link generated:", instacartLink);

    // Update grocery list with Instacart link
    await GroceryList.findByIdAndUpdate(groceryList._id, {
      instacartDeepLink: instacartLink.link, // Save only the link string
      instacartMethod: instacartLink.method,
      instacartItems: instacartLink.items,
    });

    return NextResponse.json({
      success: true,
      message: "Grocery list generated successfully",
      groceryList: {
        id: groceryList._id,
        title: groceryList.title,
        items: groceryList.items,
        totalItems: groceryList.totalItems,
        estimatedTotal: groceryList.estimatedTotal,
        currency: groceryList.currency,
        pantryToggle: groceryList.pantryToggle,
        instacartDeepLink: instacartLink,
        createdAt: groceryList.createdAt,
      },
    });
  } catch (error) {
    console.error("Grocery list generation error:", error);
    return NextResponse.json(
      {
        error: error.message,
        details: "Check server logs for more info",
      },
      { status: 500 },
    );
  }
}

/**
 * Extract all ingredients from a meal plan
 */
function extractIngredientsFromPlan(plan) {
  const ingredients = [];

  if (!plan.days || !Array.isArray(plan.days)) {
    return ingredients;
  }

  for (const day of plan.days) {
    if (!day.meals || !Array.isArray(day.meals)) continue;

    for (const meal of day.meals) {
      if (!meal.ingredients || !Array.isArray(meal.ingredients)) continue;

      for (const ingredient of meal.ingredients) {
        ingredients.push({
          name: ingredient.name || ingredient.original || "",
          quantity: ingredient.quantity || 1,
          unit: ingredient.unit || "unit",
          recipeName: meal.recipeName,
          mealType: meal.mealType,
        });
      }
    }
  }

  return ingredients;
}

/**
 * Standardize units to a common format
 */
function standardizeUnit(unit, quantity) {
  if (!unit) return "unit";

  const lowerUnit = unit.toLowerCase().trim();

  // Unit conversion map
  const unitMap = {
    // Weight
    g: "g",
    gram: "g",
    grams: "g",
    kg: "kg",
    kilogram: "kg",
    kilograms: "kg",
    oz: "oz",
    ounce: "oz",
    ounces: "oz",
    lb: "lb",
    pound: "lb",
    pounds: "lb",

    // Volume
    ml: "ml",
    milliliter: "ml",
    milliliters: "ml",
    l: "l",
    liter: "l",
    liters: "l",
    tsp: "tsp",
    teaspoon: "tsp",
    teaspoons: "tsp",
    tbsp: "tbsp",
    tablespoon: "tbsp",
    tablespoons: "tbsp",
    cup: "cup",
    cups: "cup",

    // Count
    unit: "unit",
    units: "unit",
    clove: "unit",
    cloves: "unit",
    piece: "unit",
    pieces: "unit",
    slice: "unit",
    slices: "unit",
    bunch: "unit",
    bunches: "unit",
    head: "unit",
    heads: "unit",

    // Small amounts
    pinch: "tsp",
    pinches: "tsp",
    dash: "tsp",
    dashes: "tsp",
  };

  return unitMap[lowerUnit] || "unit";
}

/**
 * Convert all units to a standard unit for merging
 */
function convertToStandardUnit(quantity, fromUnit) {
  const stdUnit = standardizeUnit(fromUnit);

  // Convert to base units for comparison
  switch (stdUnit) {
    case "g":
      return { quantity, unit: "g" };
    case "kg":
      return { quantity: quantity * 1000, unit: "g" };
    case "oz":
      return { quantity: quantity * 28.35, unit: "g" };
    case "lb":
      return { quantity: quantity * 453.592, unit: "g" };
    case "ml":
      return { quantity, unit: "ml" };
    case "l":
      return { quantity: quantity * 1000, unit: "ml" };
    case "tsp":
      return { quantity: quantity * 5, unit: "ml" };
    case "tbsp":
      return { quantity: quantity * 15, unit: "ml" };
    case "cup":
      return { quantity: quantity * 240, unit: "ml" };
    default:
      return { quantity, unit: stdUnit };
  }
}

/**
 * Convert back to purchase-friendly units
 */
function convertToPurchaseUnit(quantity, baseUnit) {
  switch (baseUnit) {
    case "g":
      if (quantity >= 1000) {
        return { quantity: quantity / 1000, unit: "kg" };
      } else if (quantity >= 500) {
        return { quantity: 0.5, unit: "kg" };
      } else {
        return { quantity: Math.ceil(quantity / 100) * 100, unit: "g" }; // Round up to nearest 100g
      }
    case "ml":
      if (quantity >= 1000) {
        return { quantity: quantity / 1000, unit: "l" };
      } else if (quantity >= 500) {
        return { quantity: 500, unit: "ml" }; // Standard bottle size
      } else if (quantity >= 250) {
        return { quantity: 250, unit: "ml" };
      } else {
        return { quantity: Math.ceil(quantity / 50) * 50, unit: "ml" }; // Round up
      }
    default:
      return { quantity: Math.ceil(quantity), unit: baseUnit }; // Round up counts
  }
}

/**
 * Clean display name without truncating words
 */
function cleanDisplayName(name) {
  if (!name) return "";

  // First extract any quantity
  const quantityMatch = name.match(/^(\d+(?:\.\d+)?)\s*/);
  let quantity = quantityMatch ? quantityMatch[1] : "";
  let cleaned = name.replace(/^\d+(?:\.\d+)?\s*/, "");

  // Remove fractions
  cleaned = cleaned.replace(/^\d+\s*\/\s*\d+\s*/, "");

  // Remove units that are separate words (not single letters)
  cleaned = cleaned.replace(
    /\s+(?:cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|oz|ounce|ounces|lb|pound|pounds|kilogram|kilograms|milliliter|milliliters|liter|liters|clove|cloves|serving|servings|pinch|pinches|dash|dashes)\b/gi,
    "",
  );

  // Remove preparation methods
  cleaned = cleaned.replace(
    /\s+(?:diced|chopped|minced|sliced|grated|shredded|fresh|frozen|canned|dried|organic|large|medium|small|extra large)\b/gi,
    "",
  );

  // Remove anything in parentheses
  cleaned = cleaned.replace(/\s*\([^)]*\)/g, "");

  // Clean up
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // If we removed everything, return the original
  if (!cleaned) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Process ingredients (deduplicate, normalize, convert units)
 */
function processIngredients(ingredients, pantryItems, pantryToggle, planDays) {
  const ingredientMap = new Map();
  // Step 1: Normalize and aggregate
  for (const ing of ingredients) {
    const normalizedName = normalizeIngredientName(ing.name);

    if (!normalizedName) continue;

    // Standardize the unit
    const stdUnit = standardizeUnit(ing.unit, ing.quantity);
    const converted = convertToStandardUnit(ing.quantity || 1, stdUnit);

    const key = `${normalizedName}_${converted.unit}`;

    if (ingredientMap.has(key)) {
      // Add to existing ingredient
      const existing = ingredientMap.get(key);
      existing.baseQuantity += converted.quantity;

      // Add recipe source
      const source = `${ing.mealType}: ${ing.recipeName}`;
      if (source && !existing.recipeSources.includes(source)) {
        existing.recipeSources.push(source);
      }
    } else {
      // Create new entry
      ingredientMap.set(key, {
        originalName: ing.name,
        normalizedName,
        baseQuantity: converted.quantity,
        baseUnit: converted.unit,
        originalUnit: stdUnit,
        aisle: mapToAisle(normalizedName),
        category: mapToAisle(normalizedName),
        recipeSources: ing.recipeName
          ? [`${ing.mealType}: ${ing.recipeName}`]
          : [],
        checked: true,
      });
    }
  }

  // Step 2: Convert to purchase-friendly units
  const result = Array.from(ingredientMap.values())
    .map((item) => {
      const purchase = convertToPurchaseUnit(item.baseQuantity, item.baseUnit);

      // Create clean display name
      const displayName = cleanDisplayName(item.originalName);

      return {
        name: displayName || item.originalName,
        normalizedName: item.normalizedName,
        quantity: purchase.quantity,
        unit: purchase.unit,
        aisle: item.aisle,
        category: item.category,
        recipeSources: item.recipeSources,
        checked: true,
        estimatedPrice: calculateItemPrice(
          item.normalizedName,
          purchase.quantity,
          purchase.unit,
        ),
        _id: new mongoose.Types.ObjectId(),
      };
    })
    .filter((item) => item.name && item.name.trim().length > 0);

  return result;
}

/**
 * Calculate estimated total
 */
const calculateItemPrice = (name, quantity, unit) => {
  const itemName = name.toLowerCase();
  let basePrice = 0;

  // Realistic base prices
  if (itemName.includes("sausage")) basePrice = 6.99;
  else if (itemName.includes("broth")) basePrice = 2.99;
  else if (itemName.includes("ricotta")) basePrice = 5.99;
  else if (itemName.includes("garlic")) basePrice = 2.99;
  else if (itemName.includes("olive oil")) basePrice = 12.99;
  else if (itemName.includes("flour")) basePrice = 6.99;
  else if (itemName.includes("salt")) basePrice = 1.99;
  else if (itemName.includes("oregano")) basePrice = 3.99;
  else if (itemName.includes("basil")) basePrice = 2.99;
  else if (itemName.includes("parsley")) basePrice = 1.99;
  else if (itemName.includes("nutmeg")) basePrice = 4.99;
  else if (itemName.includes("honey")) basePrice = 8.99;
  else if (itemName.includes("lasagna")) basePrice = 3.49;
  else if (itemName.includes("broccolini")) basePrice = 3.99;
  else if (itemName.includes("seasoning")) basePrice = 3.99;
  else basePrice = 2.99; // Default

  // Apply quantity (but cap it)
  let estimated = basePrice * Math.min(quantity || 1, 10);

  // Cap at $50 max per item
  estimated = Math.min(estimated, 50);

  return parseFloat(estimated.toFixed(2));
};

// for calculating total:
function calculateEstimatedTotal(items) {
  if (!items || !Array.isArray(items)) {
    return 0;
  }

  const total = items.reduce((sum, item) => {
    return sum + (item.estimatedPrice || 0);
  }, 0);

  return parseFloat(total.toFixed(2));
}
