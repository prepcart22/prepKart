// Basic aisle categories
export const AISLE_CATEGORIES = {
  // Produce
  apple: "Produce",
  banana: "Produce",
  orange: "Produce",
  tomato: "Produce",
  potato: "Produce",
  onion: "Produce",
  garlic: "Produce",
  carrot: "Produce",
  broccoli: "Produce",
  spinach: "Produce",
  lettuce: "Produce",
  "bell pepper": "Produce",
  cucumber: "Produce",
  zucchini: "Produce",
  mushroom: "Produce",
  lemon: "Produce",
  lime: "Produce",
  ginger: "Produce",
  celery: "Produce",
  avocado: "Produce",
  "chili pepper": "Produce",
  jalapeno: "Produce",
  habanero: "Produce",
  parsley: "Produce",
  "fresh parsley": "Produce",
  broccolini: "Produce",
  "garlic clove": "Produce",
  cloves: "Produce",
  sprigs: "Produce",

  // Dairy
  milk: "Dairy",
  cheese: "Dairy",
  yogurt: "Dairy",
  butter: "Dairy",
  cream: "Dairy",
  egg: "Dairy",
  eggs: "Dairy",
  ricotta: "Dairy",

  // Meat
  chicken: "Meat",
  beef: "Meat",
  pork: "Meat",
  lamb: "Meat",
  bacon: "Meat",
  sausage: "Meat",
  "ground beef": "Meat",
  "chicken breast": "Meat",
  steak: "Meat",
  turkey: "Meat",
  ham: "Meat",

  // Seafood
  fish: "Seafood",
  salmon: "Seafood",
  shrimp: "Seafood",
  tuna: "Seafood",
  cod: "Seafood",
  tilapia: "Seafood",

  // Plant-based proteins
  tofu: "Meat",
  tempeh: "Meat",
  seitan: "Meat",

  // Pantry
  rice: "Pantry",
  pasta: "Pantry",
  flour: "Pantry",
  sugar: "Pantry",
  salt: "Pantry",
  oil: "Pantry",
  "olive oil": "Pantry",
  vinegar: "Pantry",
  beans: "Pantry",
  lentils: "Pantry",
  "canned tomato": "Pantry",
  "coconut milk": "Pantry",
  quinoa: "Pantry",
  oats: "Pantry",
  cereal: "Pantry",
  honey: "Pantry",
  lasagna: "Pantry",
  noodle: "Pantry",
  noodles: "Pantry",
  pasta: "Pantry",
  "vegetable broth": "Pantry",
  broth: "Pantry",

  // Bakery
  bread: "Bakery",
  tortilla: "Bakery",
  naan: "Bakery",
  pita: "Bakery",
  bagel: "Bakery",
  roll: "Bakery",

  // Frozen
  frozen: "Frozen",
  "ice cream": "Frozen",

  // Beverages
  water: "Beverages",
  juice: "Beverages",
  soda: "Beverages",
  coffee: "Beverages",
  tea: "Beverages",

  // Spices
  cumin: "Spices",
  coriander: "Spices",
  turmeric: "Spices",
  paprika: "Spices",
  cinnamon: "Spices",
  oregano: "Spices",
  basil: "Spices",
  thyme: "Spices",
  rosemary: "Spices",
  "garlic powder": "Spices",
  "onion powder": "Spices",
  pepper: "Spices",
  "black pepper": "Spices",
  "white pepper": "Spices",
  "ground pepper": "Spices",
  peppercorn: "Spices",

  // Canned Goods
  "canned beans": "Canned Goods",
  "canned corn": "Canned Goods",
  "canned tuna": "Canned Goods",
  "canned soup": "Canned Goods",

  // Condiments
  ketchup: "Condiments",
  mustard: "Condiments",
  mayonnaise: "Condiments",
  "soy sauce": "Condiments",
  "hot sauce": "Condiments",
  "bbq sauce": "Condiments",

  // Snacks
  chips: "Snacks",
  crackers: "Snacks",
  cookies: "Snacks",
  nuts: "Snacks",
};

// Aisle display order
export const AISLE_ORDER = [
  "Produce",
  "Meat",
  "Seafood",
  "Dairy",
  "Bakery",
  "Frozen",
  "Pantry",
  "Canned Goods",
  "Spices",
  "Condiments",
  "Beverages",
  "Snacks",
  "Other",
];

/**
 * Map ingredient to aisle
 */
export function mapToAisle(ingredientName) {
  if (!ingredientName || typeof ingredientName !== "string") {
    return "Other";
  }

  const lowerName = ingredientName.toLowerCase().trim();

  // First, check for exact keyword matches
  for (const [keyword, aisle] of Object.entries(AISLE_CATEGORIES)) {
    if (lowerName === keyword) {
      return aisle;
    }
    if (lowerName.includes(keyword)) {
      return aisle;
    }
  }

  // Check for protein-related keywords and map them to 'Meat'
  const proteinKeywords = [
    "protein",
    "meat",
    "poultry",
    "seafood",
    "steak",
    "chop",
    "cutlet",
    "fillet",
    "wing",
    "thigh",
    "drumstick",
  ];

  for (const keyword of proteinKeywords) {
    if (lowerName.includes(keyword)) {
      return "Meat"; 
    }
  }

  // Add more intelligent category detection 
  const categoryKeywords = {
    Produce: [
      "fresh",
      "vegetable",
      "fruit",
      "greens",
      "leafy",
      "herb",
      "organic",
      "farm",
      "sprout",
      "microgreen",
    ],
    Dairy: [
      "dairy",
      "milk",
      "cheese",
      "yogurt",
      "cream",
      "butter",
      "curd",
      "whey",
      "casein",
      "lactose",
    ],
    Pantry: [
      "grain",
      "cereal",
      "legume",
      "bean",
      "lentil",
      "pulse",
      "seed",
      "nut",
      "flour",
      "meal",
      "staple",
    ],
    Bakery: [
      "bread",
      "bake",
      "pastry",
      "dough",
      "crust",
      "loaf",
      "bun",
      "roll",
      "baguette",
      "croissant",
    ],
    Spices: [
      "spice",
      "seasoning",
      "herb",
      "flavoring",
      "marinade",
      "rub",
      "blend",
      "mix",
      "powder",
      "extract",
    ],
    Condiments: [
      "sauce",
      "dressing",
      "marinade",
      "dip",
      "spread",
      "relish",
      "chutney",
      "paste",
      "glaze",
    ],
    Beverages: [
      "drink",
      "beverage",
      "juice",
      "soda",
      "pop",
      "water",
      "sparkling",
      "still",
      "carbonated",
    ],
    Snacks: [
      "snack",
      "chip",
      "crisp",
      "cracker",
      "cookie",
      "biscuit",
      "bar",
      "trail mix",
      "granola",
    ],
  };

  for (const [aisle, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (lowerName.includes(keyword)) {
        return aisle;
      }
    }
  }

  // Check by category keywords
  if (
    lowerName.includes("spice") ||
    lowerName.includes("herb") ||
    lowerName.includes("seasoning")
  ) {
    return "Spices";
  }

  if (
    lowerName.includes("can") ||
    lowerName.includes("jar") ||
    lowerName.includes("tin")
  ) {
    return "Canned Goods";
  }

  if (
    lowerName.includes("sauce") ||
    lowerName.includes("dressing") ||
    lowerName.includes("paste")
  ) {
    return "Condiments";
  }

  if (
    lowerName.includes("chip") ||
    lowerName.includes("cracker") ||
    lowerName.includes("cookie") ||
    lowerName.includes("snack")
  ) {
    return "Snacks";
  }

  if (lowerName.includes("frozen") || lowerName.includes("ice")) {
    return "Frozen";
  }

  if (
    lowerName.includes("drink") ||
    lowerName.includes("beverage") ||
    lowerName.includes("soda") ||
    lowerName.includes("juice")
  ) {
    return "Beverages";
  }

  return "Other";
}

/**
 *  ingredient name (remove quantities, clean up)
 */
export function normalizeIngredientName(name) {
  if (!name) return '';
  
  // Convert to lowercase and trim
  let normalized = name.toLowerCase().trim();
  
  // Remove numbers and fractions at the beginning ONLY
  normalized = normalized.replace(/^\s*\d+\s*(?:\.\d+)?\s*\/\s*\d+\s*/, '');
  normalized = normalized.replace(/^\s*\d+\s*(?:\.\d+)?\s*/, '');

  
  // Remove measurement units - ONLY as separate words
  const unitPattern = /\s+(?:cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lb|kilograms?|kg|grams?|milliliters?|ml|liters?|litres?|cloves?|pinches?|dashes?|pieces?|slices?|bunches?)\b/gi;
  normalized = normalized.replace(unitPattern, ' ');
  
  // Remove preparation words
  const prepPattern = /\s+(?:diced|chopped|minced|sliced|grated|shredded|fresh|frozen|canned|dried|organic|raw|cooked|large|medium|small|whole|crushed|ground)\b/gi;
  normalized = normalized.replace(prepPattern, ' ');
  
  // Remove parentheses
  normalized = normalized.replace(/\s*\([^)]*\)/g, '');
  
  // Clean up spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // console.log(`[AISLE MAPPER DEBUG] Final result: "${normalized}"`);
  
  return normalized;
}

/**
 * Sort items by aisle order
 */
export function sortByAisle(items) {
  if (!items || !Array.isArray(items)) {
    return [];
  }

  return [...items].sort((a, b) => {
    const aisleA = AISLE_ORDER.indexOf(a.aisle || "Other");
    const aisleB = AISLE_ORDER.indexOf(b.aisle || "Other");

    // Both aisles are in our order
    if (aisleA !== -1 && aisleB !== -1) {
      return aisleA - aisleB;
    }

    // Only aisleA is in order
    if (aisleA !== -1) return -1;

    // Only aisleB is in order
    if (aisleB !== -1) return 1;

    // Neither are in order, sort alphabetically
    return (a.aisle || "Other").localeCompare(b.aisle || "Other");
  });
}

/**
 * Deduplicate and sum quantities
 */
export function deduplicateIngredients(ingredients) {
  if (!ingredients || !Array.isArray(ingredients)) {
    return [];
  }

  const map = new Map();

  ingredients.forEach((ing) => {
    if (!ing || !ing.name) return;

    const normalizedName = normalizeIngredientName(ing.name);
    const unit = ing.unit || "unit";
    const key = `${normalizedName}_${unit}`;

    if (map.has(key)) {
      const existing = map.get(key);
      existing.quantity += ing.quantity || 1;
      // Update recipe sources
      if (ing.recipeName && !existing.recipeSources.includes(ing.recipeName)) {
        existing.recipeSources.push(ing.recipeName);
      }
    } else {
      map.set(key, {
        name: ing.name,
        normalizedName: normalizedName,
        quantity: ing.quantity || 1,
        unit: unit,
        aisle: mapToAisle(ing.name),
        category: mapToAisle(ing.name),
        recipeSources: ing.recipeName ? [ing.recipeName] : [],
        checked: false,
      });
    }
  });

  return Array.from(map.values());
}
