import { NextResponse } from 'next/server';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { connectDB } from '@/lib/db';

export async function GET(request) {
  try {
    const authResult = await authenticate(request);
    if (!authResult.success || !requireAdmin(authResult.userTier)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '30days';
    
    try {
      await connectDB();
      const Click = (await import('@/models/Click')).default;
      
      // Calculate date ranges based on the selected filter
      const endDate = new Date();
      let startDate = new Date();
      
      switch(range) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case '7days':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30days':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case 'all':
          startDate = new Date(0); // Beginning of time
          break;
        default:
          startDate.setDate(endDate.getDate() - 30);
      }
      
      // Query for clicks
      const clicks = await Click.find({
        type: 'instacart',
        timestamp: { $gte: startDate, $lte: endDate }
      }).sort({ timestamp: 1 });
      
      // console.log(`Found ${clicks.length} clicks for range: ${range}`);
      
      // Calculate summary statistics
      const totalClicks = clicks.length;
      const tier3Clicks = clicks.filter(c => c.userTier === 'tier3').length;
      const tier2Clicks = clicks.filter(c => c.userTier === 'tier2').length;
      const freeClicks = clicks.filter(c => !c.userTier || c.userTier === 'free').length;
      const totalItems = clicks.reduce((sum, c) => sum + (c.metadata?.checkedItemsCount || 0), 0);
      
      // Generate different data sets based on time range
      let hourlyData = [];
      let dailyData = [];
      let monthlyData = [];
      
      // Generate hourly data (for today view)
      if (range === 'today') {
        // console.log('Generating hourly data for today...');
        const currentHour = new Date().getHours();
        const hoursMap = {};
        
        // Create entries for all 24 hours
        for (let i = 0; i < 24; i++) {
          const hour = i.toString().padStart(2, '0');
          hoursMap[hour] = { 
            hour: `${hour}:00`, 
            clicks: 0,
            tier3: 0,
            tier2: 0,
            free: 0
          };
        }
        
        // Populate with actual clicks
        clicks.forEach(click => {
          const hour = new Date(click.timestamp).getHours().toString().padStart(2, '0');
          if (hoursMap[hour]) {
            hoursMap[hour].clicks++;
            if (click.userTier === 'tier3') hoursMap[hour].tier3++;
            else if (click.userTier === 'tier2') hoursMap[hour].tier2++;
            else hoursMap[hour].free++;
          }
        });
        
        // Convert to array and keep only hours up to current hour
        hourlyData = Object.values(hoursMap).slice(0, currentHour + 1);
        // console.log(`Hourly data generated: ${hourlyData.length} hours`);
      }
      
      // Generate daily data (for 7 days and 30 days views)
      if (range === '7days' || range === '30days') {
        const daysCount = range === '7days' ? 7 : 30;
        const daysMap = {};
        
        // Initialize last N days
        for (let i = daysCount - 1; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dateKey = date.toISOString().split('T')[0];
          const formattedDate = date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          });
          daysMap[dateKey] = { 
            date: formattedDate, 
            clicks: 0, 
            tier3: 0, 
            tier2: 0, 
            free: 0 
          };
        }
        
        // Populate with real data
        clicks.forEach(click => {
          const date = new Date(click.timestamp);
          const dateKey = date.toISOString().split('T')[0];
          if (daysMap[dateKey]) {
            daysMap[dateKey].clicks++;
            if (click.userTier === 'tier3') daysMap[dateKey].tier3++;
            else if (click.userTier === 'tier2') daysMap[dateKey].tier2++;
            else daysMap[dateKey].free++;
          }
        });
        
        dailyData = Object.values(daysMap);
      }
      
      // Generate monthly data (for all time view)
      if (range === 'all') {
        const monthsMap = {};
        
        clicks.forEach(click => {
          const date = new Date(click.timestamp);
          const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
          const monthName = date.toLocaleDateString('en-US', { 
            month: 'short', 
            year: 'numeric' 
          });
          
          if (!monthsMap[monthKey]) {
            monthsMap[monthKey] = { 
              month: monthName, 
              clicks: 0,
              tier3: 0,
              tier2: 0,
              free: 0
            };
          }
          monthsMap[monthKey].clicks++;
          if (click.userTier === 'tier3') monthsMap[monthKey].tier3++;
          else if (click.userTier === 'tier2') monthsMap[monthKey].tier2++;
          else monthsMap[monthKey].free++;
        });
        
        // Sort by date
        monthlyData = Object.values(monthsMap).sort((a, b) => {
          const dateA = new Date(a.month);
          const dateB = new Date(b.month);
          return dateA - dateB;
        });
      }
      
      // Calculate averages and commission
      const avgItemsPerClick = totalClicks > 0 ? (totalItems / totalClicks).toFixed(1) : 0;
      const estimatedCommission = Math.round(totalItems * 0.10);
      
      const responseData = {
        success: true,
        data: {
          summary: {
            totalClicks,
            tier3Clicks,
            tier2Clicks,
            freeClicks,
            totalItems,
            avgItemsPerClick,
            estimatedCommission,
            commissionRate: 0.50,
            period: getPeriodLabel(range),
            lastUpdated: new Date().toISOString(),
            hasRealData: clicks.length > 0
          },
          hourlyData,
          dailyData,
          monthlyData
        }
      };
      
      // console.log('Response data prepared:', {
      //   totalClicks,
      //   hourlyDataLength: hourlyData.length,
      //   dailyDataLength: dailyData.length,
      //   monthlyDataLength: monthlyData.length
      // });
      
      return NextResponse.json(responseData);
      
    } catch (dbError) {
      console.error('Database error:', dbError.message);
      
      // Return empty data structure with hasRealData: false
      return NextResponse.json({
        success: true,
        data: {
          summary: {
            totalClicks: 0,
            tier3Clicks: 0,
            tier2Clicks: 0,
            freeClicks: 0,
            totalItems: 0,
            avgItemsPerClick: 0,
            estimatedCommission: 0,
            commissionRate: 0.50,
            period: getPeriodLabel(range),
            lastUpdated: new Date().toISOString(),
            hasRealData: false
          },
          hourlyData: [],
          dailyData: [],
          monthlyData: []
        }
      });
    }
    
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message,
        data: null
      },
      { status: 500 }
    );
  }
}

// Helper function to get period label
function getPeriodLabel(range) {
  switch(range) {
    case 'today': return 'Today';
    case '7days': return 'Last 7 days';
    case '30days': return 'Last 30 days';
    case 'all': return 'All time';
    default: return 'Last 30 days';
  }
}