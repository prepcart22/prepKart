import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import GroceryList from "@/models/GroceryList";
import { authenticate } from "@/middleware/auth";
import User from "@/models/User";

export async function GET(request, { params }) {
  try {
    await connectDB();

    // AUTHENTICATION CHECK HERE
    const authResult = await authenticate(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error, message: authResult.message },
        { status: authResult.status || 401 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Grocery list ID is required" },
        { status: 400 }
      );
    }

    // Find the grocery list
    const groceryList = await GroceryList.findById(id);

    if (!groceryList) {
      return NextResponse.json(
        {
          success: false,
          error: "Grocery list not found",
        },
        { status: 404 }
      );
    }

    // AUTHORIZATION CHECK - User must own this grocery list
    if (
      groceryList.userId &&
      groceryList.userId.toString() !== authResult.userId.toString()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "You don't have permission to view this grocery list",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      groceryList: {
        _id: groceryList._id,
        id: groceryList._id.toString(),
        title: groceryList.title,
        planTitle: groceryList.planTitle,
        items: groceryList.items || [],
        totalItems: groceryList.totalItems || 0,
        estimatedTotal: groceryList.estimatedTotal || 0,
        currency: groceryList.currency || "CAD",
        pantryToggle: groceryList.pantryToggle || false,
        instacartDeepLink: groceryList.instacartDeepLink || null,
        createdAt: groceryList.createdAt,
        userId: groceryList.userId,
        isActive: groceryList.isActive !== false,
      },
    });
  } catch (error) {
    console.error("Get grocery list error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    await connectDB();

    const auth = await authenticate(request);
    if (!auth.success) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { userId } = auth;
    const { id } = await params;
    const body = await request.json();

    // console.log("PATCH request for:", id, "Items:", body.items?.length || 0);

    // Find the grocery list
    const existingList = await GroceryList.findById(id);
    if (!existingList) {
      return NextResponse.json({ error: "Grocery list not found" }, { status: 404 });
    }

    // Check ownership
    if (existingList.userId.toString() !== userId.toString()) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // ====== FIXED: REPLACE ENTIRE ITEMS ARRAY ======
    if (body.items) {
      // COMPLETELY REPLACE the items array with what's sent from frontend
      const finalItems = body.items.map(item => {
        // If item has an existing ID, keep it
        if (item._id && mongoose.Types.ObjectId.isValid(item._id)) {
          return {
            name: item.name || "Item",
            quantity: item.quantity || 1,
            unit: item.unit || "unit",
            aisle: item.aisle || "Other",
            category: item.category || "Other",
            checked: item.checked === true,
            estimatedPrice: item.estimatedPrice || 0,
            normalizedName: item.normalizedName || item.name?.toLowerCase() || "",
            recipeSources: item.recipeSources || [],
            note: item.note || "",
            _id: new mongoose.Types.ObjectId(item._id)
          };
        }
        
        // New item - create new ID
        return {
          name: item.name || "Item",
          quantity: item.quantity || 1,
          unit: item.unit || "unit",
          aisle: item.aisle || "Other",
          category: item.category || "Other",
          checked: item.checked === true,
          estimatedPrice: item.estimatedPrice || 0,
          normalizedName: item.normalizedName || item.name?.toLowerCase() || "",
          recipeSources: item.recipeSources || [],
          note: item.note || "",
          _id: new mongoose.Types.ObjectId(),
        };
      });

      const checkedCount = finalItems.filter(item => item.checked).length;

      // console.log("Replacing items:", {
      //   oldItemCount: existingList.items.length,
      //   newItemCount: finalItems.length,
      //   itemsDeleted: existingList.items.length - finalItems.length,
      //   checkedCount
      // });

      // COMPLETELY REPLACE the items array
      const updatedList = await GroceryList.findByIdAndUpdate(
        id,
        {
          items: finalItems, // <-- This REPLACES the entire array
          checkedItems: checkedCount,
          totalItems: finalItems.length,
          estimatedTotal: body.estimatedTotal || existingList.estimatedTotal,
          updatedAt: new Date(),
        },
        { new: true, runValidators: true }
      );

      return NextResponse.json({
        success: true,
        groceryList: updatedList,
        message: "Grocery list updated",
      });
    }

    // If no items, update other fields
    const updateData = {
      updatedAt: new Date(),
    };

    if (body.totalItems !== undefined) updateData.totalItems = body.totalItems;
    if (body.checkedItems !== undefined) updateData.checkedItems = body.checkedItems;
    if (body.estimatedTotal !== undefined) updateData.estimatedTotal = body.estimatedTotal;

    const updatedList = await GroceryList.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    return NextResponse.json({
      success: true,
      groceryList: updatedList,
      message: "Grocery list updated",
    });

  } catch (error) {
    console.error("Update error:", error);
    return NextResponse.json({ 
      error: "Failed to update grocery list",
      details: error.message 
    }, { status: 500 });
  }
}