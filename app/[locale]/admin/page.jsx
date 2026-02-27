"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import * as React from "react";
import {
  Users,
  CreditCard,
  Utensils,
  ShoppingCart,
  FileText,
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from "lucide-react";

export default function AdminDashboardPage({ params }) {
  const router = useRouter();
  const { locale } = React.use(params);

  // Get Redux state
  const authState = useSelector((state) => state.auth);
  const { user, isAuthenticated, loading: authLoading } = authState;
  const [pageLoading, setPageLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Check admin status
  const isAdmin = user?.tier === "admin";

  // Fetch dashboard stats
  const fetchDashboardStats = async () => {
    try {
      setLoadingStats(true);
      const token =
        localStorage.getItem("token") || localStorage.getItem("accessToken");
      const response = await fetch("/api/admin/dashboard/stats", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch stats");
      }

      const data = await response.json();
      if (data.success) {
        setStats(data.data);
        setLastUpdated(data.data.lastUpdated);
      }
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (authLoading) {
      return;
    }

    // Handle authentication and admin checks
    let shouldRedirect = false;
    let redirectPath = `/${locale}/login`;

    if (!isAuthenticated) {
      const storedUser = localStorage.getItem("user");
      const token =
        localStorage.getItem("token") || localStorage.getItem("accessToken");

      if (storedUser && token) {
        try {
          const parsedUser = JSON.parse(storedUser);
          if (parsedUser.tier !== "admin") {
            shouldRedirect = true;
            redirectPath = `/${locale}`;
          }
        } catch (error) {
          console.error("Failed to parse localStorage user:", error);
          shouldRedirect = true;
        }
      } else {
        shouldRedirect = true;
      }
    } else if (!user) {
      shouldRedirect = true;
    } else if (!isAdmin) {
      shouldRedirect = true;
      redirectPath = `/${locale}`;
    }

    if (shouldRedirect) {
      router.push(redirectPath);
      return;
    }

    // Fetch stats if authenticated as admin
    fetchDashboardStats();

    const timer = setTimeout(() => {
      setPageLoading(false);
    }, 0);

    return () => clearTimeout(timer);
  }, [isAuthenticated, user, authLoading, locale, router, isAdmin]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!isAdmin) return;

    const interval = setInterval(
      () => {
        fetchDashboardStats();
      },
      5 * 60 * 1000,
    ); // 5 minutes

    return () => clearInterval(interval);
  }, [isAdmin]);

  if (authLoading || pageLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <div className='w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto'></div>
          <p className='mt-4 text-gray-600'>Checking admin access...</p>
        </div>
      </div>
    );
  }

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Format number with commas
  const formatNumber = (num) => {
    return new Intl.NumberFormat("en-CA").format(num);
  };

  // Stats card component
  const StatCard = ({
    title,
    value,
    growth,
    icon: Icon,
    iconColor,
    bgColor,
  }) => {
    const isPositive = growth >= 0;

    return (
      <div className='bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100'>
        <div className='flex items-start justify-between mb-3 sm:mb-4'>
          <div>
            <p className='text-gray-600 text-xs sm:text-sm mb-1'>{title}</p>
            <div className='text-2xl sm:text-3xl font-bold text-gray-800'>
              {loadingStats ? (
                <div className='h-8 w-20 bg-gray-200 rounded animate-pulse'></div>
              ) : title.includes("Revenue") ? (
                formatCurrency(value)
              ) : (
                formatNumber(value)
              )}
            </div>
          </div>
          <div
            className={`w-10 h-10 sm:w-12 sm:h-12 ${bgColor} rounded-lg flex items-center justify-center`}>
            <Icon
              className='w-5 h-5 sm:w-6 sm:h-6'
              style={{ color: iconColor }}
            />
          </div>
        </div>
        <div className='flex items-center text-xs sm:text-sm'>
          {loadingStats ? (
            <div className='h-4 w-24 bg-gray-200 rounded animate-pulse'></div>
          ) : (
            <>
              {isPositive ? (
                <TrendingUp className='w-3 h-3 sm:w-4 sm:h-4 text-green-500 mr-1' />
              ) : (
                <TrendingDown className='w-3 h-3 sm:w-4 sm:h-4 text-red-500 mr-1' />
              )}
              <span
                className={
                  isPositive
                    ? "text-green-500 font-medium"
                    : "text-red-500 font-medium"
                }>
                {growth >= 0 ? "+" : ""}
                {growth.toFixed(1)}%
              </span>
              <span className='text-gray-500 ml-1'>vs last month</span>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Header */}
      <div className='mb-6 sm:mb-8'>
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <div>
            <h1 className='text-2xl sm:text-3xl font-bold text-gray-800 mb-2'>
              Dashboard Overview
            </h1>
            <p className='text-sm sm:text-base text-gray-600'>
              Welcome back! Here is whats happening with Prepcart today.
              {lastUpdated && (
                <span className='text-xs text-gray-500 ml-2'>
                  Last updated:{" "}
                  {new Date(lastUpdated).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={fetchDashboardStats}
            disabled={loadingStats}
            className='inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'>
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loadingStats ? "animate-spin" : ""}`}
            />
            Refresh Data
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6'>
        <StatCard
          title='Total Users'
          value={stats?.totalUsers.value || 0}
          growth={stats?.totalUsers.growth || 0}
          icon={Users}
          iconColor='#3b82f6'
          bgColor='bg-blue-50'
        />

        <StatCard
          title='Active Subscribers'
          value={stats?.activeSubscribers.value || 0}
          growth={stats?.activeSubscribers.growth || 0}
          icon={CreditCard}
          iconColor='#10b981'
          bgColor='bg-green-50'
        />

        <StatCard
          title='Monthly Revenue'
          value={stats?.monthlyRevenue.value || 0}
          growth={stats?.monthlyRevenue.growth || 0}
          icon={() => <span className='text-xl sm:text-2xl'>$</span>}
          iconColor='#10b981'
          bgColor='bg-green-50'
        />

        <StatCard
          title='Instacart Clicks'
          value={stats?.instacartClicks.value || 0}
          growth={stats?.instacartClicks.growth || 0}
          icon={ShoppingCart}
          iconColor='#f97316'
          bgColor='bg-orange-50'
        />

        <StatCard
          title='Meal Plans Generated'
          value={stats?.mealPlansGenerated.value || 0}
          growth={stats?.mealPlansGenerated.growth || 0}
          icon={Utensils}
          iconColor='#8b5cf6'
          bgColor='bg-purple-50'
        />

        <StatCard
          title='Blog Traffic'
          value={stats?.blogTraffic.value || 0}
          growth={stats?.blogTraffic.growth || 0}
          icon={FileText}
          iconColor='#ec4899'
          bgColor='bg-pink-50'
        />
      </div>

      {/* Additional Info */}
      {/* {stats && (
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Current Period</h3>
              <p className="text-lg font-semibold text-gray-800">{stats.period.currentMonth}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Comparison Period</h3>
              <p className="text-lg font-semibold text-gray-800">{stats.period.previousMonth}</p>
            </div>
          </div>
        </div>
      )} */}
    </>
  );
}
