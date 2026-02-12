import OpenAI from "openai";
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
// Cache
const requestCache = new Map();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours
// Add this function at the TOP of your openai.js (after imports)
async function getRealNutritionFromSpoonacular(
  ingredients,
  mealType,
  servings = 2,
) {
  try {
    console.log("Starting Spoonacular call...");
    // Check API key first
    if (!process.env.SPOONACULAR_API_KEY) {
      console.error(
        "SPOONACULAR_API_KEY is missing from environment variables!",
      );
      return null;
    }
    console.log(
      "API Key present (first 8 chars):",
      process.env.SPOONACULAR_API_KEY.substring(0, 8) + "...",
    );
    // Convert ingredients
    const ingredientList = ingredients
      .map((ing) => `${ing.quantity || 1} ${ing.unit || ""} ${ing.name}`.trim())
      .join("\n");
    console.log(
      "Ingredients to validate:",
      ingredientList.substring(0, 100) + "...",
    );
    // Make the API call - USE FETCH DIRECTLY (available in Next.js)
    console.log("Calling Spoonacular API...");
    const response = await fetch(
      `https://api.spoonacular.com/recipes/analyze?apiKey=${process.env.SPOONACULAR_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          title: `${mealType} Recipe`,
          ingredients: ingredientList,
          servings: servings,
          includeNutrition: true,
        }),
      },
    );
    console.log("Spoonacular response status:", response.status);
    console.log("Spoonacular response ok:", response.ok);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Spoonacular API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText.substring(0, 200),
      });
      return null;
    }
    const nutritionData = await response.json();
    console.log("Spoonacular response received successfully!");
    // Extract and format nutrition data
    const nutrients = nutritionData.nutrition?.nutrients || [];
    const findNutrient = (name) => {
      const nutrient = nutrients.find((n) =>
        n.name.toLowerCase().includes(name.toLowerCase()),
      );
      return nutrient ? Math.round(nutrient.amount) : null;
    };
    // Calculate estimated cost
    const estimatedCost = calculateMealCost(ingredients, "Medium", servings);
    return {
      nutrition: {
        calories: findNutrient("calories") || 300,
        protein_g: findNutrient("protein") || 15,
        carbs_g: findNutrient("carbohydrate") || findNutrient("carbs") || 40,
        fat_g: findNutrient("fat") || 10,
        fiber_g: findNutrient("fiber") || 5,
        sugar_g: findNutrient("sugar") || 8,
        sodium_mg: findNutrient("sodium") || 300,
        cholesterol_mg: findNutrient("cholesterol") || 30,
        estimated: false,
        spoonacularVerified: true,
      },
      estimatedCost: estimatedCost,
      spoonacularData: nutritionData,
    };
  } catch (error) {
    console.error("Spoonacular function error:", error.message);
    console.error("Error stack:", error.stack);
    return null;
  }
}

// will use later for phase 2
function calculateMealCost(ingredients, budgetLevel = "Medium", servings = 2) {
  const budgetMultipliers = {
    Low: 0.7,
    Medium: 1.0,
    High: 1.4,
  };
  const multiplier = budgetMultipliers[budgetLevel] || 1.0;
  // Simple calculation
  let baseCost = ingredients.length * 1.0 * (servings / 2);
  // Adjust for expensive ingredients
  const expensiveKeywords = [
    "chicken",
    "beef",
    "fish",
    "salmon",
    "steak",
    "lamb",
    "shrimp",
  ];
  const hasExpensive = ingredients.some((ing) =>
    expensiveKeywords.some((keyword) =>
      ing.name.toLowerCase().includes(keyword),
    ),
  );
  if (hasExpensive) baseCost += 3.0;
  const finalCost = baseCost * multiplier;
  return parseFloat(finalCost.toFixed(2));
}

export async function generateMealPlan(inputs, userTier = "free") {
  // Validate inputs
  if (!inputs || typeof inputs !== "object") {
    inputs = {};
  }

  // Extract ALL form fields
  const daysCount = parseInt(inputs.days_count) || 7;
  const mealsPerDay = parseInt(inputs.meals_per_day) || 3;
  const maxCookingTime = parseInt(inputs.max_cooking_time) || 30;
  const cuisine = inputs.cuisine || "any";
  const portions = parseInt(inputs.portions) || 2;
  const goal = inputs.goal || "healthy eating";

  // Additional inputs
  const province = inputs.province || "";
  const budgetLevel = inputs.budgetLevel || "Medium";
  const likes = inputs.likes || "";
  const dislikes = inputs.dislikes || "";
  const cookingMethod = inputs.cookingMethod || "";
  const skillLevel = inputs.skillLevel || "Beginner";
  const dietaryPreferences = Array.isArray(inputs.dietaryPreferences)
    ? inputs.dietaryPreferences
    : [];
  const allergies = Array.isArray(inputs.allergies) ? inputs.allergies : [];

  console.log(`Generating ${daysCount}-day plan with ${mealsPerDay} meals/day`);
  console.log("All inputs received:", {
    daysCount,
    mealsPerDay,
    maxCookingTime,
    cuisine,
    portions,
    goal,
    province,
    budgetLevel,
    likes,
    dislikes,
    cookingMethod,
    skillLevel,
    dietaryPreferences,
    allergies,
    userTier,
  });

  // Create cache key
  const cacheKey = JSON.stringify({
    days_count: daysCount,
    meals_per_day: mealsPerDay,
    max_cooking_time: maxCookingTime,
    cuisine,
    portions,
    goal,
    province,
    budgetLevel,
    likes,
    dislikes,
    cookingMethod,
    skillLevel,
    dietaryPreferences: dietaryPreferences.sort(),
    allergies: allergies.sort(),
    userTier,
    includeSpoonacular: userTier !== "free",
  });

  // Check cache first
  if (requestCache.has(cacheKey)) {
    const cached = requestCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      console.log("Returning cached meal plan");
      return cached.data;
    }
  }

  try {
    // Handle dietary conflicts
    let adjustedLikes = inputs.likes || "";
    let adjustedDislikes = inputs.dislikes || "";

    if (dietaryPreferences.includes("vegan")) {
      const nonVegan = [
        "egg",
        "eggs",
        "meat",
        "chicken",
        "beef",
        "fish",
        "dairy",
        "cheese",
        "honey",
        "gelatin",
      ];
      adjustedLikes = adjustedLikes
        .split(/[,\s]+/)
        .filter(
          (item) => !nonVegan.some((nv) => item.toLowerCase().includes(nv)),
        )
        .join(", ");

      adjustedDislikes = (
        adjustedDislikes + ", eggs, dairy, meat, fish, poultry, seafood, honey"
      ).replace(/^,\s*/, "");
    }

    // Define meal types based on meals per day
    let mealTypes = [];
    if (mealsPerDay === 1) {
      mealTypes = ["lunch"];
    } else if (mealsPerDay === 2) {
      mealTypes = ["breakfast", "dinner"];
    } else if (mealsPerDay === 3) {
      mealTypes = ["breakfast", "lunch", "dinner"];
    } else if (mealsPerDay === 4) {
      mealTypes = ["breakfast", "lunch", "dinner", "snack"];
    } else {
      // For 5+ meals, repeat snack
      mealTypes = [
        "breakfast",
        "mid-morning snack",
        "lunch",
        "afternoon snack",
        "dinner",
      ];
      if (mealsPerDay > 5) {
        const extraSnacks = mealsPerDay - 5;
        for (let i = 0; i < extraSnacks; i++) {
          mealTypes.push(`snack ${i + 1}`);
        }
      }
      mealTypes = mealTypes.slice(0, mealsPerDay);
    }

    // Enhanced prompt for GPT-5
    const prompt = `
Generate a detailed ${daysCount}-day personalized meal plan with EXACTLY ${daysCount} days and EXACTLY ${mealsPerDay} meals per day.

CRITICAL REQUIREMENTS:
1. Meals per day: ${mealsPerDay}
2. Meal types in order: ${mealTypes.join(", ")}
3. Each meal MUST be appropriate for its type (breakfast must be breakfast food, lunch must be lunch food, etc.)
4. Maximum cooking time per meal: ${maxCookingTime} minutes
5. Dietary restrictions: ${dietaryPreferences.join(", ") || "None"}
6. Allergies to avoid: ${allergies.join(", ") || "None"}
7. Skill level: ${skillLevel}
8. Budget: ${budgetLevel}
9. Cuisine preference: ${cuisine}
10. Number of people: ${portions}

USER PREFERENCES:
- Goal: ${goal}
- Location: ${province}, Canada
- Cooking method preference: ${cookingMethod || "Any"}
- Liked foods: ${adjustedLikes || "None specified"}
- Disliked foods: ${adjustedDislikes || "None specified"}

MEAL TYPE SPECIFICATIONS:
1. BREAKFAST: Should include typical breakfast items (eggs, oatmeal, toast, smoothies, cereals, pancakes, etc.) unless restricted by diet
2. SNACKS: Should be light, between-meal options 
3. LUNCH: Should be lighter than dinner, suitable for midday (salads, sandwiches, soups, wraps, etc.)
4. SNACKS: Should be light, between-meal options (fruits, nuts, yogurt, etc.)
5. DINNER: Should be the main/heartiest meal of the day (protein + sides, casseroles, stews, etc.)



EXPECTED OUTPUT FORMAT - RETURN ONLY VALID JSON:
{
  "days": [
    {
      "dayIndex": 1,
      "dayName": "Monday",
      "date": "2024-01-01", // Use current or upcoming date
      "meals": [
        {
          "mealIndex": 1,
          "mealType": "breakfast", // Must match the specified meal types
          "recipeName": "Creative, Appetizing Recipe Name",
          "description": "Brief description of the meal",
          "ingredients": [
            { 
              "name": "Specific ingredient name", 
              "quantity": 1.5, 
              "unit": "cups",
              "notes": "optional preparation note"
            }
          ],
          "cookingTime": 25,
          "prepTime": 10,
          "totalTime": 35,
          "instructions": [
            "Step 1: Detailed instruction with specific actions",
            "Step 2: Next step with precise measurements",
            "Step 3: Cooking step with temperature/time",
            "Step 4: Final preparation or serving"
          ],
          "recipeSource": "openai",
          "notes": "Helpful tips, variations, or serving suggestions",
          "nutrition": {
            "calories": 350,
            "protein_g": 15,
            "carbs_g": 45,
            "fat_g": 10,
            "fiber_g": 5,
            "sugar_g": 8,
            "estimated": true
          },
          "estimatedCost": 5.50,
          "difficulty": "Easy"
        }
      ]
    }
  ]
}

QUALITY REQUIREMENTS:
1. Recipe names must be creative and appetizing
2. Ingredients must be specific with exact quantities
3. Instructions must be VERY DETAILED with 6-8 steps minimum for each recipe. Each step should include precise actions, timings, temperatures, and tips for beginners.
4. Cooking times must be realistic and within ${maxCookingTime} minutes
5. Meals must be appropriate for ${skillLevel} skill level
6. Consider ingredient availability in ${province}, Canada
7. Respect ${budgetLevel} budget constraints
8. Ensure variety across days (don't repeat similar recipes)
9. Each meal type must have appropriate foods for that time of day

IMPORTANT:
- The "days" array MUST have EXACTLY ${daysCount} items
- Each day's "meals" array MUST have EXACTLY ${mealsPerDay} items
- Meal types must follow this order: ${mealTypes.join(", ")}
- Return ONLY JSON - no markdown, no explanations
- All strings must be in double quotes
- Ensure recipes are 100% compliant with dietary preferences and allergies

Now generate a ${daysCount}-day ${cuisine} meal plan following ALL these requirements.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.2-chat-latest",
      messages: [
        {
          role: "system",
          content: `You are an expert nutritionist, professional chef, and meal planning specialist.

CRITICAL RULES:
1. Return ONLY a valid JSON object - no markdown, no explanations
2. The JSON MUST have EXACTLY ${daysCount} days in the "days" array
3. Each day MUST have EXACTLY ${mealsPerDay} meals in the "meals" array
4. Meal types MUST be: ${mealTypes.join(", ")} in this exact order
5. All recipes MUST comply with: ${
            dietaryPreferences.join(", ") || "no restrictions"
          }
6. All recipes MUST avoid: ${allergies.join(", ") || "no allergies"}
7. Maximum cooking time per meal: ${maxCookingTime} minutes
8. Skill level: ${skillLevel}
9. Budget: ${budgetLevel}
10. Portions: ${portions}
11. Meals must be appropriate for their type (breakfast, lunch, dinner, snack)

QUALITY STANDARDS:
- Provide detailed, specific instructions (4-6 steps minimum)
- Use precise ingredient quantities with clear units
- Include helpful cooking tips and notes
- Ensure recipes are practical for home cooking
- Consider ingredient availability in ${province}
- Balance nutrition with flavor and appeal
- Breakfast recipes should be typical breakfast foods
- Lunch recipes should be lighter than dinner
- Dinner recipes should be the heartiest meal
- Snacks should be light and between meals

Return ONLY the JSON object.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_completion_tokens: 16000,
      // temperature: 0.7,
      response_format: { type: "json_object" },
    });

    // Extract content
    let content = "";
    if (response.choices && response.choices.length > 0) {
      const choice = response.choices[0];
      if (choice && choice.message && choice.message.content) {
        content = choice.message.content.trim();
        console.log("Content extracted, length:", content.length);
      }
    }

    if (!content || content.trim() === "") {
      console.log("No content found, using fallback");
      return generateSimpleFallbackPlan(inputs);
    }

    // Clean the response
    content = content.trim();
    if (content.startsWith("```json")) {
      content = content.substring(7);
    }
    if (content.startsWith("```")) {
      content = content.substring(3);
    }
    if (content.endsWith("```")) {
      content = content.substring(0, content.length - 3);
    }
    content = content.trim();

    // Parse and validate JSON
    let planData;
    try {
      planData = JSON.parse(content);
      console.log("JSON parsed successfully!");
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError.message);
      // Try to extract JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          planData = JSON.parse(jsonMatch[0]);
          console.log("JSON recovered from content");
        } catch (secondError) {
          console.error("Recovery failed:", secondError.message);
          return generateSimpleFallbackPlan(inputs);
        }
      } else {
        return generateSimpleFallbackPlan(inputs);
      }
    }

    // Validate structure
    if (
      !planData ||
      typeof planData !== "object" ||
      !Array.isArray(planData.days)
    ) {
      console.error("Invalid plan structure, using fallback");
      return generateSimpleFallbackPlan(inputs);
    }

    // Ensure correct number of days
    if (planData.days.length !== daysCount) {
      console.log(
        `Adjusting days from ${planData.days.length} to ${daysCount}`,
      );
      if (planData.days.length > daysCount) {
        planData.days = planData.days.slice(0, daysCount);
      } else {
        const dayNames = [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ];
        while (planData.days.length < daysCount) {
          const newIndex = planData.days.length + 1;
          planData.days.push({
            dayIndex: newIndex,
            dayName: dayNames[(newIndex - 1) % 7],
            meals: [],
          });
        }
      }
    }

    for (let dayIndex = 0; dayIndex < planData.days.length; dayIndex++) {
      const day = planData.days[dayIndex];

      // Ensure day structure
      if (!day.dayIndex) day.dayIndex = dayIndex + 1;
      if (!day.dayName) {
        const dayNames = [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ];
        day.dayName = dayNames[dayIndex % 7];
      }

      // Ensure meals array exists
      if (!Array.isArray(day.meals)) {
        day.meals = [];
      }

      // Ensure correct number of meals
      if (day.meals.length !== mealsPerDay) {
        console.log(
          `Day ${dayIndex + 1}: Adjusting meals from ${
            day.meals.length
          } to ${mealsPerDay}`,
        );

        if (day.meals.length > mealsPerDay) {
          day.meals = day.meals.slice(0, mealsPerDay);
        } else {
          // Add missing meals
          while (day.meals.length < mealsPerDay) {
            const mealIndex = day.meals.length;
            const mealType = mealTypes[mealIndex % mealTypes.length];
            day.meals.push(createEnhancedFallbackMeal(mealType, inputs));
          }
        }
      }

      // Process each meal - MAKE ASYNC
      for (let mealIndex = 0; mealIndex < day.meals.length; mealIndex++) {
        const meal = day.meals[mealIndex];

        // Ensure meal type matches expected
        const expectedMealType = mealTypes[mealIndex % mealTypes.length];
        if (!meal.mealType || meal.mealType !== expectedMealType) {
          meal.mealType = expectedMealType;
        }

        // Ensure basic structure
        if (!meal.recipeName || typeof meal.recipeName !== "string") {
          meal.recipeName = `${cuisine} ${expectedMealType}`;
        }

        if (!Array.isArray(meal.ingredients) || meal.ingredients.length === 0) {
          meal.ingredients = createDefaultIngredients(expectedMealType, inputs);
        }

        if (
          !Array.isArray(meal.instructions) ||
          meal.instructions.length === 0
        ) {
          meal.instructions = createDefaultInstructions(expectedMealType);
        }

        if (!meal.cookingTime || typeof meal.cookingTime !== "number") {
          meal.cookingTime = Math.min(25, maxCookingTime);
        }

        // In your meal processing loop:
        if (userTier !== "free") {
          console.log(
            `PAID USER (${userTier}) - Calling Spoonacular for meal ${
              mealIndex + 1
            }`,
          );

          try {
            const spoonacularData = await getRealNutritionFromSpoonacular(
              meal.ingredients,
              meal.mealType || expectedMealType,
              portions,
            );

            console.log(
              `Spoonacular result for ${meal.recipeName}:`,
              spoonacularData ? "SUCCESS" : "FAILED",
            );

            if (spoonacularData) {
              meal.nutrition = spoonacularData.nutrition;
              meal.estimatedCost = spoonacularData.estimatedCost;
              meal.spoonacularVerified = true;
              console.log(`${meal.recipeName} - Spoonacular validated`);
            } else {
              // Fallback
              meal.nutrition = createNutritionInfo(expectedMealType);
              meal.spoonacularVerified = false;
              console.log(`${meal.recipeName} - Using fallback nutrition`);
            }
          } catch (error) {
            console.error(
              `Spoonacular error for ${meal.recipeName}:`,
              error.message,
            );
            meal.nutrition = createNutritionInfo(expectedMealType);
            meal.spoonacularVerified = false;
          }
        } else {
          console.log(
            `FREE USER - Skipping Spoonacular for meal ${mealIndex + 1}`,
          );
          if (!meal.nutrition) {
            meal.nutrition = createNutritionInfo(expectedMealType);
          }
        }

        // Ensure recipe source
        if (!meal.recipeSource) {
          meal.recipeSource = "openai";
        }
      }
    }
    // Add metadata
    planData.metadata = {
      generatedAt: new Date().toISOString(),
      userPreferences: {
        daysCount,
        mealsPerDay,
        maxCookingTime,
        cuisine,
        portions,
        goal,
        province,
        budgetLevel,
        likes: adjustedLikes,
        dislikes: adjustedDislikes,
        cookingMethod,
        skillLevel,
        dietaryPreferences,
        allergies,
        userTier,
      },
      mealTypes,
    };

    // Cache the result
    requestCache.set(cacheKey, {
      timestamp: Date.now(),
      data: planData,
    });

    console.log(`Successfully generated ${daysCount}-day meal plan`);
    return planData;
  } catch (error) {
    console.error("OpenAI error:", error);
    return generateSimpleFallbackPlan(inputs);
  }
}

// Helper function for creating enhanced fallback meals
function createEnhancedFallbackMeal(mealType, inputs) {
  const cuisine = inputs.cuisine || "any";
  const maxCookingTime = parseInt(inputs.max_cooking_time) || 30;
  const dietaryPreferences = inputs.dietaryPreferences || [];
  const isVegan = dietaryPreferences.includes("vegan");
  const isVegetarian = dietaryPreferences.includes("vegetarian");

  // Meal-specific templates
  const mealTemplates = {
    breakfast: {
      vegan: [
        "Tofu Scramble with Veggies",
        "Oatmeal with Berries",
        "Avocado Toast",
      ],
      vegetarian: [
        "Vegetable Omelette",
        "Greek Yogurt Parfait",
        "Cheese Toastie",
      ],
      regular: ["Scrambled Eggs", "Pancakes", "Breakfast Burrito"],
    },
    lunch: {
      vegan: ["Chickpea Salad Wrap", "Lentil Soup", "Vegetable Stir Fry"],
      vegetarian: ["Caprese Sandwich", "Vegetable Quiche", "Pasta Primavera"],
      regular: ["Chicken Salad", "Turkey Sandwich", "Beef Wrap"],
    },
    dinner: {
      vegan: ["Lentil Curry", "Vegetable Stew", "Tofu Stir Fry"],
      vegetarian: ["Paneer Tikka", "Vegetable Lasagna", "Stuffed Peppers"],
      regular: ["Grilled Chicken", "Fish with Vegetables", "Beef Stir Fry"],
    },
    snack: {
      vegan: ["Fruit Salad", "Roasted Chickpeas", "Vegetable Sticks"],
      vegetarian: ["Yogurt with Honey", "Cheese and Crackers", "Smoothie"],
      regular: ["Mixed Nuts", "Protein Bar", "Apple with Peanut Butter"],
    },
    "mid-morning snack": {
      vegan: ["Banana", "Almonds", "Rice Cakes"],
      vegetarian: ["Greek Yogurt", "Hard Boiled Egg", "Cottage Cheese"],
      regular: ["Protein Shake", "Granola Bar", "Fruit and Nuts"],
    },
    "afternoon snack": {
      vegan: ["Hummus with Veggies", "Trail Mix", "Fresh Fruit"],
      vegetarian: ["Cheese Stick", "Yogurt", "Apple Slices"],
      regular: ["Crackers with Cheese", "Protein Ball", "Smoothie"],
    },
  };

  // Determine template category
  let category = "regular";
  if (isVegan) category = "vegan";
  else if (isVegetarian) category = "vegetarian";

  // Get template for this meal type
  const templates =
    mealTemplates[mealType.toLowerCase()] || mealTemplates.snack;
  const recipeNames =
    templates[category] || templates.regular || templates.vegan;

  const recipeName = `${cuisine !== "any" ? cuisine + " " : ""}${
    recipeNames[Math.floor(Math.random() * recipeNames.length)]
  }`;

  // Create appropriate ingredients
  const ingredients = createDefaultIngredients(mealType, inputs);

  return {
    mealType: mealType,
    recipeName: recipeName,
    description: `A delicious ${cuisine} ${mealType} perfect for your dietary needs`,
    ingredients: ingredients,
    cookingTime: Math.min(25, maxCookingTime),
    prepTime: 10,
    totalTime: Math.min(35, maxCookingTime + 10),
    instructions: createDefaultInstructions(mealType),
    recipeSource: "openai-fallback",
    notes: "Adjust seasoning to taste",
    difficulty: "Easy",
    estimatedCost: 4.5,
  };
}

function createDefaultIngredients(mealType, inputs) {
  const isVegan = inputs.dietaryPreferences?.includes("vegan") || false;
  const isVegetarian =
    inputs.dietaryPreferences?.includes("vegetarian") || false;
  const portions = inputs.portions || 2;

  const baseIngredients = [
    { name: "Salt", quantity: 0.5, unit: "teaspoon", notes: "to taste" },
    {
      name: "Black pepper",
      quantity: 0.25,
      unit: "teaspoon",
      notes: "freshly ground",
    },
    {
      name: "Olive oil",
      quantity: 1,
      unit: "tablespoon",
      notes: "or cooking oil of choice",
    },
  ];

  let mealSpecificIngredients = [];

  switch (mealType.toLowerCase()) {
    case "breakfast":
      if (isVegan) {
        mealSpecificIngredients = [
          {
            name: "Firm tofu",
            quantity: portions * 0.5,
            unit: "block",
            notes: "crumbled",
          },
          {
            name: "Bell peppers",
            quantity: portions * 0.5,
            unit: "cup",
            notes: "diced",
          },
          {
            name: "Onion",
            quantity: portions * 0.25,
            unit: "cup",
            notes: "chopped",
          },
          {
            name: "Spinach",
            quantity: portions * 1,
            unit: "cup",
            notes: "fresh",
          },
        ];
      } else if (isVegetarian) {
        mealSpecificIngredients = [
          { name: "Eggs", quantity: portions * 2, unit: "large" },
          { name: "Milk", quantity: portions * 2, unit: "tablespoons" },
          {
            name: "Cheese",
            quantity: portions * 0.25,
            unit: "cup",
            notes: "shredded",
          },
          {
            name: "Tomatoes",
            quantity: portions * 0.5,
            unit: "cup",
            notes: "diced",
          },
        ];
      } else {
        mealSpecificIngredients = [
          { name: "Eggs", quantity: portions * 2, unit: "large" },
          { name: "Bread", quantity: portions * 2, unit: "slices" },
          { name: "Butter", quantity: portions * 1, unit: "tablespoon" },
        ];
      }
      break;

    case "lunch":
      mealSpecificIngredients = [
        { name: "Mixed greens", quantity: portions * 2, unit: "cups" },
        { name: "Cherry tomatoes", quantity: portions * 0.5, unit: "cup" },
        {
          name: "Cucumber",
          quantity: portions * 0.5,
          unit: "cup",
          notes: "sliced",
        },
      ];

      if (!isVegan) {
        mealSpecificIngredients.push({
          name: "Protein of choice",
          quantity: portions * 1,
          unit: "serving",
        });
      }
      break;

    case "dinner":
      if (isVegan) {
        mealSpecificIngredients = [
          {
            name: "Lentils",
            quantity: portions * 0.5,
            unit: "cup",
            notes: "dry",
          },
          {
            name: "Carrots",
            quantity: portions * 1,
            unit: "cup",
            notes: "chopped",
          },
          {
            name: "Potatoes",
            quantity: portions * 1,
            unit: "cup",
            notes: "cubed",
          },
        ];
      } else {
        mealSpecificIngredients = [
          {
            name: "Protein (chicken/fish/tofu)",
            quantity: portions * 1,
            unit: "serving",
          },
          {
            name: "Rice",
            quantity: portions * 0.5,
            unit: "cup",
            notes: "uncooked",
          },
          { name: "Mixed vegetables", quantity: portions * 1.5, unit: "cups" },
        ];
      }
      break;

    default: // snacks
      mealSpecificIngredients = [
        { name: "Fresh fruit", quantity: portions * 1, unit: "serving" },
        { name: "Nuts", quantity: portions * 0.25, unit: "cup" },
      ];
  }

  return [...mealSpecificIngredients, ...baseIngredients];
}

function createDefaultInstructions(mealType) {
  switch (mealType.toLowerCase()) {
    case "breakfast":
      return [
        "Prepare all ingredients as specified",
        "Heat oil in a pan over medium heat",
        "Cook main ingredients until done",
        "Season to taste and serve hot",
      ];
    case "lunch":
      return [
        "Wash and prepare all vegetables",
        "Combine ingredients in a bowl or plate",
        "Add dressing or seasoning",
        "Serve fresh or pack for later",
      ];
    case "dinner":
      return [
        "Preheat oven or pan as needed",
        "Cook protein and vegetables separately",
        "Combine and simmer with sauce/seasoning",
        "Cook grains separately and serve together",
      ];
    default:
      return ["Prepare ingredients", "Combine as needed", "Serve immediately"];
  }
}

function createNutritionInfo(mealType) {
  const baseNutrition = {
    estimated: true,
    spoonacularVerified: false,
    estimated: true,
    fiber_g: Math.floor(Math.random() * 8) + 3,
    sugar_g: Math.floor(Math.random() * 15) + 5,
  };

  switch (mealType.toLowerCase()) {
    case "breakfast":
      return {
        calories: 300 + Math.floor(Math.random() * 150),
        protein_g: 15 + Math.floor(Math.random() * 10),
        carbs_g: 35 + Math.floor(Math.random() * 20),
        fat_g: 10 + Math.floor(Math.random() * 8),
        ...baseNutrition,
      };
    case "lunch":
      return {
        calories: 400 + Math.floor(Math.random() * 200),
        protein_g: 20 + Math.floor(Math.random() * 15),
        carbs_g: 45 + Math.floor(Math.random() * 25),
        fat_g: 15 + Math.floor(Math.random() * 10),
        ...baseNutrition,
      };
    case "dinner":
      return {
        calories: 500 + Math.floor(Math.random() * 250),
        protein_g: 25 + Math.floor(Math.random() * 20),
        carbs_g: 50 + Math.floor(Math.random() * 30),
        fat_g: 20 + Math.floor(Math.random() * 15),
        ...baseNutrition,
      };
    default: // snacks
      return {
        calories: 150 + Math.floor(Math.random() * 100),
        protein_g: 5 + Math.floor(Math.random() * 5),
        carbs_g: 20 + Math.floor(Math.random() * 15),
        fat_g: 5 + Math.floor(Math.random() * 5),
        ...baseNutrition,
      };
  }
}

function generateSimpleFallbackPlan(inputs) {
  const daysCount = Math.min(parseInt(inputs.days_count) || 3, 3);
  const mealsPerDay = parseInt(inputs.meals_per_day) || 3;
  const cuisine = inputs.cuisine || "any";
  const dietaryPreferences = inputs.dietaryPreferences || [];

  const dayNames = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const days = [];

  for (let i = 0; i < daysCount; i++) {
    const meals = [];
    const mealTypes =
      mealsPerDay === 1
        ? ["lunch"]
        : mealsPerDay === 2
          ? ["breakfast", "dinner"]
          : mealsPerDay === 3
            ? ["breakfast", "lunch", "dinner"]
            : ["breakfast", "lunch", "dinner", "snack"];

    for (let j = 0; j < Math.min(mealsPerDay, 4); j++) {
      const mealType = mealTypes[j];
      meals.push(createEnhancedFallbackMeal(mealType, inputs));
    }

    days.push({
      dayIndex: i + 1,
      dayName: dayNames[i % 7],
      meals: meals,
    });
  }

  return {
    days,
    metadata: {
      isFallback: true,
      generatedAt: new Date().toISOString(),
    },
  };
}

export async function generateAlternativeMeal(
  inputs,
  oldMealName,
  userTier = "free",
) {
  // Input validation
  if (!inputs || typeof inputs !== "object") {
    inputs = {};
  }

  const actualTier = userTier || inputs.userTier || "free";
  const cuisine = inputs.cuisine?.trim() || "any";
  const mealType = inputs.mealType?.trim() || "lunch";
  const maxCookingTime = parseInt(inputs.max_cooking_time) || 30;
  const portions = parseInt(inputs.portions) || 2;

  // Validate mealType
  const validMealTypes = ["breakfast", "lunch", "dinner", "snack"];
  const validatedMealType = validMealTypes.includes(mealType.toLowerCase())
    ? mealType.toLowerCase()
    : "lunch";

  try {
    const prompt = `Generate a COMPLETELY DIFFERENT ${cuisine} ${validatedMealType} recipe.

CRITICAL: The current recipe is "${oldMealName}" - DO NOT REPEAT THIS!
Generate something completely different in taste, ingredients, and preparation.

IMPORTANT: This is a ${validatedMealType} - it MUST be appropriate for ${validatedMealType} time:
- Breakfast: Typical breakfast foods (eggs, oatmeal, toast, etc.)
- Lunch: Lighter meal suitable for midday
- Dinner: Heartiest meal of the day
- Snack: Light between-meal option

Cuisine: ${cuisine}
Meal type: ${validatedMealType}
Max cooking time: ${maxCookingTime} minutes
Portions: ${portions}

Return ONLY JSON:
{
  "recipeName": "NEW AND DIFFERENT Recipe Name",
  "mealType": "${validatedMealType}",
  "ingredients": [{"name":"ingredient","quantity":1,"unit":"cup","notes":"optional"}],
  "cookingTime": 25,
  "instructions": ["Step 1: Detailed instruction","Step 2: Next step"],
  "description": "Brief description"
}`;

    //     const response = await openai.chat.completions.create({
    //       model: "gpt-4o",  // or "gpt-4o-mini" for speed
    //       messages: [
    //         {
    //           role: "system",
    //           content: `You are a professional chef. Return ONLY valid JSON.
    //           Generate a COMPLETELY DIFFERENT recipe than "${oldMealName}".
    //           The recipe MUST be appropriate for ${validatedMealType}.
    //           Include detailed ingredients with quantities and clear instructions. Instructions must be VERY DETAILED with 6-8 steps minimum for each recipe. Each step should include precise actions, timings, temperatures, and tips for beginners.`,
    //         },
    //         {
    //           role: "user",
    //           content: prompt,
    //         },
    //       ],

    // max_completion_tokens: 4000,
    // temperature: 0.6,  // Optional, now supported again
    // response_format: { type: "json_object" },
    //     });

    const response = await openai.chat.completions.create({
      model: "gpt-5.2-chat-latest",
      messages: [
        {
          role: "system",
          content: `You are an expert nutritionist, professional chef, and meal planning specialist.

CRITICAL RULES:
1. Return ONLY a valid JSON object - no markdown, no explanations
2. The JSON MUST have EXACTLY ${daysCount} days in the "days" array
3. Each day MUST have EXACTLY ${mealsPerDay} meals in the "meals" array
4. Meal types MUST be: ${mealTypes.join(", ")} in this exact order
5. All recipes MUST comply with: ${
            dietaryPreferences.join(", ") || "no restrictions"
          }
6. All recipes MUST avoid: ${allergies.join(", ") || "no allergies"}
7. Maximum cooking time per meal: ${maxCookingTime} minutes
8. Skill level: ${skillLevel}
9. Budget: ${budgetLevel}
10. Portions: ${portions}
11. Meals must be appropriate for their type (breakfast, lunch, dinner, snack)

QUALITY STANDARDS:
- Provide detailed, specific instructions (4-6 steps minimum)
- Use precise ingredient quantities with clear units
- Include helpful cooking tips and notes
- Ensure recipes are practical for home cooking
- Consider ingredient availability in ${province}
- Balance nutrition with flavor and appeal
- Breakfast recipes should be typical breakfast foods
- Lunch recipes should be lighter than dinner
- Dinner recipes should be the heartiest meal
- Snacks should be light and between meals

Return ONLY the JSON object.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_completion_tokens: 16000,
      // temperature: 0.7,
      response_format: { type: "json_object" },
    });
    let content = response.choices[0]?.message?.content || "";
    if (!content) {
      throw new Error("AI returned empty response for alternative");
    }

    // Clean response
    content = content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/```json?\n?|\n?```/g, "");
    }
    content = content.trim();

    let mealData;
    try {
      mealData = JSON.parse(content);
    } catch (parseError) {
      console.error("Alternative JSON Parse Error:", parseError.message);
      return generateFallbackAlternative(inputs, oldMealName, actualTier);
    }

    // Build complete meal object
    const completeMeal = {
      mealType: validatedMealType,
      recipeName:
        mealData.recipeName || `Alternative ${cuisine} ${validatedMealType}`,
      description:
        mealData.description || `A delicious alternative ${validatedMealType}`,
      ingredients:
        Array.isArray(mealData.ingredients) && mealData.ingredients.length > 0
          ? mealData.ingredients
          : createDefaultIngredients(validatedMealType, inputs),
      cookingTime:
        typeof mealData.cookingTime === "number"
          ? Math.min(mealData.cookingTime, maxCookingTime)
          : Math.min(25, maxCookingTime),
      instructions:
        Array.isArray(mealData.instructions) && mealData.instructions.length > 0
          ? mealData.instructions
          : createDefaultInstructions(validatedMealType),
      recipeSource: "openai",
      isAlternative: true,
      tier: actualTier,
    };

    // Add nutrition for paid tiers
    if (actualTier !== "free") {
      completeMeal.nutrition = createNutritionInfo(validatedMealType);
    }

    return completeMeal;
  } catch (error) {
    console.error("Alternative generation error:", error.message);
    return generateFallbackAlternative(inputs, oldMealName, actualTier);
  }
}

function generateFallbackAlternative(inputs, oldMealName, userTier) {
  const cuisine = inputs.cuisine || "any";
  const mealType = inputs.mealType || "lunch";

  return createEnhancedFallbackMeal(mealType, inputs);
}

// Update generateChatGPTRecipe function to use gpt-4o
export async function generateChatGPTRecipe(prompt, options = {}) {
  try {
    console.log("Generating recipe with GPT-5.2...");
    const response = await openai.chat.completions.create({
      model: "gpt-5.2-chat-latest",
      messages: [
        {
          role: "system",
          content: `You are a professional chef. Return ONLY a valid JSON object with this exact format:
{
  "title": "Recipe Name",
  "mealType": "breakfast/lunch/dinner/snack",
  "description": "Brief description",
  "ingredients": [{"name": "ingredient", "quantity": 1.5, "unit": "cups", "notes": "optional"}],
  "instructions": ["Step 1: Detailed instruction", "Step 2: Next step"],
  "prep_time_minutes": 10,
  "cook_time_minutes": 20,
  "total_time_minutes": 30,
  "servings": 2,
  "difficulty": "Easy"
}
Instructions must be VERY DETAILED with 6-8 steps minimum for each recipe. Each step should include precise actions, timings, temperatures, and tips for beginners.
NO other text. NO explanations. NO markdown. ONLY the JSON object.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_completion_tokens: 4000,
      // temperature: 0.7,
      response_format: { type: "json_object" },
    });

    let content = response.choices[0]?.message?.content || "";
    if (!content) {
      return getFallbackRecipe(prompt);
    }

    // Clean and parse
    content = content
      .trim()
      .replace(/```json?\n?|\n?```/g, "")
      .trim();

    let recipeData;
    try {
      recipeData = JSON.parse(content);
    } catch (parseError) {
      console.error("JSON parse error:", parseError.message);
      recipeData = getFallbackRecipe(prompt);
    }

    console.log("Recipe generated:", recipeData.title);
    return recipeData;
  } catch (error) {
    console.error("GPT-4o API error:", error.message);
    return getFallbackRecipe(prompt);
  }
}

function getFallbackRecipe(prompt) {
  // Try to extract meal type from prompt
  const mealMatch =
    prompt.toLowerCase().match(/create a (\w+) recipe/i) ||
    prompt.toLowerCase().match(/meal type: (\w+)/i) ||
    prompt.toLowerCase().match(/for (\w+)/i);
  const mealType = mealMatch ? mealMatch[1] : "lunch";

  // Try to extract cuisine
  const cuisineMatch = prompt.toLowerCase().match(/cuisine: (\w+)/i);
  const cuisine = cuisineMatch ? cuisineMatch[1] : "";

  return {
    title: `${cuisine ? cuisine + " " : ""}${
      mealType.charAt(0).toUpperCase() + mealType.slice(1)
    }`,
    mealType: mealType,
    description: `A delicious ${cuisine} ${mealType}`,
    ingredients: createDefaultIngredients(mealType, { portions: 2 }),
    instructions: createDefaultInstructions(mealType),
    prep_time_minutes: 10,
    cook_time_minutes: 20,
    total_time_minutes: 30,
    servings: 2,
    difficulty: "Easy",
  };
}
