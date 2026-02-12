import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';

export async function POST(request) {
  try {
    await connectDB();
    const Click = (await import('@/models/Click')).default;
    
    const data = await request.json();
    
    // Prepare click data
    const clickData = {
      type: data.type || 'instacart',
      timestamp: new Date(data.timestamp || Date.now()),
      userTier: data.userTier || 'free',
      checkedItemsCount: data.checkedItemsCount || 0,
      metadata: data.metadata || {}
    };
    
    // Handle userId - if it's not a valid ObjectId, keep as string
    if (data.userId && data.userId !== 'anonymous') {
      try {
        // Check if it's a valid ObjectId
        if (data.userId.match(/^[0-9a-fA-F]{24}$/)) {
          clickData.userId = data.userId;
        } else {
          clickData.userId = data.userId; // Keep as string
        }
      } catch (error) {
        clickData.userId = data.userId; // Keep as string on error
      }
    } else if (data.userId === 'anonymous') {
      clickData.userId = 'anonymous'; // Explicitly set as string
    }
    
    // Handle groceryListId similarly
    if (data.groceryListId) {
      try {
        if (data.groceryListId.match(/^[0-9a-fA-F]{24}$/)) {
          clickData.groceryListId = data.groceryListId;
        } else {
          clickData.groceryListId = data.groceryListId;
        }
      } catch (error) {
        clickData.groceryListId = data.groceryListId;
      }
    }
    
    // console.log('Saving click:', clickData);
    
    // Create new click record
    const click = new Click(clickData);
    
    await click.save();
    
    // console.log('Click saved successfully:', {
    //   id: click._id,
    //   type: click.type,
    //   userTier: click.userTier,
    //   userId: click.userId,
    //   checkedItemsCount: click.checkedItemsCount,
    //   timestamp: click.timestamp
    // });
    
    return NextResponse.json({ 
      success: true, 
      message: 'Click tracked successfully',
      clickId: click._id 
    });
    
  } catch (error) {
    console.error('Error saving click:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        message: 'Failed to track click'
      },
      { status: 500 }
    );
  }
}

// Also add GET endpoint for testing
export async function GET(request) {
  try {
    await connectDB();
    const Click = (await import('@/models/Click')).default;
    
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit')) || 10;
    
    const clicks = await Click.find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    
    const totalClicks = await Click.countDocuments();
    const instacartClicks = await Click.countDocuments({ type: 'instacart' });
    
    return NextResponse.json({
      success: true,
      total: totalClicks,
      instacart: instacartClicks,
      clicks: clicks,
      message: `Found ${totalClicks} total clicks, ${instacartClicks} instacart clicks`
    });
    
  } catch (error) {
    console.error('Error fetching clicks:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message
      },
      { status: 500 }
    );
  }
}