import { NextResponse } from "next/server";
import mongoose from "mongoose";

// Helper to connect to DB (use your existing connection method)
async function connectToDB() {
  if (mongoose.connection.readyState >= 1) return;
  await mongoose.connect(process.env.MONGODB_URI);
}

// Click tracking function
async function trackInstacartClick(trackingData) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/clicks`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "instacart",
          timestamp: new Date().toISOString(),
          userTier: trackingData.userTier || "free",
          userId: trackingData.userId || "anonymous",
          groceryListId: trackingData.groceryListId,
          checkedItemsCount:
            trackingData.checkedItemsCount || trackingData.totalItems || 0,
          metadata: {
            method: trackingData.method || "idp_api",
            source: trackingData.source || "unknown",
            impactId: trackingData.impactId,
            instacartUrl: trackingData.instacartUrl,
            itemsCount: trackingData.itemsCount,
            ...trackingData.metadata,
          },
        }),
      },
    );

    if (!response.ok) {
      console.warn("Click tracking API call failed");
      return { success: false };
    }

    const result = await response.json();
    // console.log(
    //   "Click tracked via API:",
    //   result.success ? "Success" : "Failed",
    // );
    return result;
  } catch (error) {
    console.error("Click tracking error:", error);
    return { success: false, error: error.message };
  }
}
export async function POST(request) {
  console.log("=== INSTACART SHOPPING LIST CREATION ===");

  try {
    const body = await request.json();
    const { groceryItems, userId, groceryListId } = body;

    // Get user info for tracking
    const userTier = body.userTier || "free";
    const impactId = process.env.INSTACART_IMPACT_ID || "6899496";

    // Validate
    if (!groceryItems || !Array.isArray(groceryItems)) {
      return NextResponse.json(
        { success: false, error: "Invalid grocery items" },
        { status: 400 },
      );
    }

    // console.log("Received items:", groceryItems.length, "User tier:", userTier);

    // Filter checked items
    const checkedItems = groceryItems.filter((item) => item.checked !== false);

    if (checkedItems.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No items selected",
        },
        { status: 400 },
      );
    }

    // console.log(`Creating shopping list with ${checkedItems.length} items`);

    // Get credentials
    const INSTACART_API_KEY = process.env.INSTACART_API_KEY;
    const INSTACART_IMPACT_ID = process.env.INSTACART_IMPACT_ID || "6899496";
    const INSTACART_API_ENDPOINT =
      process.env.INSTACART_API_ENDPOINT || "https://connect.instacart.ca";

    if (!INSTACART_API_KEY) {
      console.error("INSTACART_API_KEY is missing");
      return NextResponse.json(
        {
          success: false,
          error: "API key not configured",
        },
        { status: 500 },
      );
    }

    // Format items
    const line_items = checkedItems.map((item) => {
      const unit = mapToInstacartUnit(item.unit || "unit");
      const quantity = Math.max(1, Math.ceil(item.quantity || 1)).toString();

      return {
        name: item.name?.trim() || "Item",
        line_item_measurements: [
          {
            quantity: quantity,
            unit: unit,
          },
        ],
      };
    });

    // Build payload
    const payload = {
      title: "Weekly Grocery Essentials",
      link_type: "shopping_list",
      partner_id: INSTACART_IMPACT_ID,
      expires_in: 100,
      instructions: ["Add these items to your weekly cart"],
      line_items: line_items,
      landing_page_configuration: {
        partner_linkback_url: "https://prepcart.ca",
        enable_pantry_items: true,
      },
    };

    console.log("Sending to Instacart API...");

    // Make the request
    const response = await fetch(
      `${INSTACART_API_ENDPOINT}/idp/v1/products/products_link`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${INSTACART_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    // console.log("Response status:", response.status);

    const responseText = await response.text();

    if (!response.ok) {
      console.error("Instacart API failed:", {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
      });

      return NextResponse.json(
        {
          success: false,
          error: `Instacart API Error: ${response.status}`,
          details: responseText,
        },
        { status: 500 },
      );
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse response:", responseText);
      throw new Error("Invalid JSON response from Instacart");
    }

    console.log("Instacart response:", data);

    if (!data.products_link_url) {
      throw new Error("No shopping list URL in response");
    }

    let shoppingListUrl = data.products_link_url;
    if (shoppingListUrl && INSTACART_IMPACT_ID) {
      const baseParams = {
        utm_campaign: "instacart-idp",
        utm_medium: "affiliate",
        utm_source: "instacart_idp",
        utm_term: "partnertype-mediapartner",
        utm_content: `campaignid-20313_partnerid-${INSTACART_IMPACT_ID}`,
      };

      const urlObj = new URL(shoppingListUrl);
      const existingParams = urlObj.searchParams;

      // Append (or overwrite if somehow already present)
      Object.entries(baseParams).forEach(([key, value]) => {
        urlObj.searchParams.set(key, value);
      });

      shoppingListUrl = urlObj.toString();

      // console.log("Affiliate-tracked URL:", shoppingListUrl);
    }
    // console.log("Shopping list created:", shoppingListUrl);

    // ===== TRACK THIS CLICK =====
    const trackingResult = await trackInstacartClick({
      userId: userId,
      userTier: userTier,
      groceryListId: groceryListId,
      checkedItemsCount: checkedItems.length,
      totalItems: checkedItems.length,
      method: "idp_api",
      source: body.source || "unknown", // Add 'source' from frontend
      impactId: INSTACART_IMPACT_ID,
      metadata: {
        instacartUrl: shoppingListUrl,
        itemsCount: checkedItems.length,
        apiResponse: data,
      },
    });

    // console.log(
    //   "Tracking result:",
    //   trackingResult.success ? "✅ Tracked" : "❌ Failed",
    // );

    return NextResponse.json({
      success: true,
      shopping_list_id: shoppingListUrl.split("/").pop(),
      url: shoppingListUrl,
      items: checkedItems.length,
      tracked: trackingResult.success,
    });
  } catch (error) {
    console.error("Unhandled error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}

// Helper function to map units
function mapToInstacartUnit(unit) {
  const unitMap = {
    unit: "each",
    count: "each",
    piece: "each",
    cup: "cup",
    tbsp: "tablespoon",
    tsp: "teaspoon",
    ml: "milliliter",
    milliliter: "milliliter",
    l: "liter",
    liter: "liter",
    oz: "ounce",
    ounce: "ounce",
    kg: "kilogram",
    kilogram: "kilogram",
    g: "gram",
    gram: "gram",
    lb: "pound",
    pound: "pound",
  };

  const lowerUnit = unit?.toLowerCase() || "each";
  return unitMap[lowerUnit] || "each";
}
