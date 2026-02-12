"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  X,
  Bookmark,
  Crown,
  Calendar,
  MapPin,
  Mail,
  Utensils,
  Heart,
  DollarSign,
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-toastify";

export default function DashboardModal({ isOpen, onClose, locale }) {
  const modalRef = useRef(null);
  const searchParams = useSearchParams();
  const groceryListIdFromURL = searchParams.get("groceryListId");
  const [activeTab, setActiveTab] = useState("Meal Plans");
  const [savedMealPlans, setSavedMealPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pantry, setPantry] = useState(null);
  const [pantryLoading, setPantryLoading] = useState(true);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [newPantryItem, setNewPantryItem] = useState({
    name: "",
    quantity: 1,
    unit: "unit",
  });
  // Get user data from Redux
  const { user, loading: userLoading } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const router = useRouter();

  const [isCancelling, setIsCancelling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  // Fetch saved meal plans when modal opens
  useEffect(() => {
    if (!isOpen || !user?.id) {
      setIsInitialLoading(false);
      return;
    }

    const fetchSavedPlans = async () => {
      setLoading(true);
      try {
        // Get token from localStorage
        const token =
          localStorage.getItem("token") || localStorage.getItem("accessToken");

        if (!token) {
          console.log("No token found, user might not be logged in");
          setSavedMealPlans([]);
          return;
        }

        const response = await fetch(`/api/plans?userId=${user.id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            console.log("User not authenticated");
            setSavedMealPlans([]);
            return;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const allPlans = await response.json();

        // Filter only saved plans
        const savedPlans = allPlans.filter((plan) => {
          return (
            plan.isSaved === true ||
            (plan.title && plan.title.toLowerCase().includes("quick"))
          );
        });

        setSavedMealPlans(savedPlans);
      } catch (error) {
        console.error("Error fetching plans:", error);
        setSavedMealPlans([]);
      } finally {
        setLoading(false);
      }
    };
    const fetchPantry = async () => {
      if (user?.tier === "free") {
        setPantryLoading(false);
        return;
      }

      try {
        setPantryLoading(true);

        // Get token from localStorage
        const token =
          localStorage.getItem("token") ||
          localStorage.getItem("accessToken") ||
          "";

        const response = await fetch("/api/pantry", {
          headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        });

        if (response.ok) {
          const data = await response.json();
          setPantry(data.pantry || data);
        }
      } catch (error) {
        console.error("Error fetching pantry:", error);
      } finally {
        setPantryLoading(false);
      }
    };

    setIsInitialLoading(true);

    // fetchSavedPlans();
    // fetchPantry();

    // loading until data is fetched

    Promise.all([fetchSavedPlans(), fetchPantry()])
      .catch((err) => console.error("Dashboard data fetch failed:", err))
      .finally(() => {
        setIsInitialLoading(false);
      });

    if (groceryListIdFromURL) {
      setGroceryListId(groceryListIdFromURL);
    }
  }, [isOpen, user?.id, groceryListIdFromURL, user?.tier]);

  const handleClickOutside = useCallback(
    (e) => {
      if (isConfirmingDelete) return;
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    },
    [onClose, isConfirmingDelete],
  );

  // Pantry functions
  const addPantryItem = async () => {
    if (!newPantryItem.name.trim()) {
      // Use your toast or alert
      console.error("Please enter an item name");
      return;
    }

    try {
      const token =
        localStorage.getItem("token") ||
        localStorage.getItem("accessToken") ||
        "";

      const response = await fetch("/api/pantry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          items: [newPantryItem],
          action: "add",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setPantry(data.pantry || data);
        setNewPantryItem({ name: "", quantity: 1, unit: "unit" });
        // toast.success("Item added to pantry");
      }
    } catch (error) {
      console.error("Error adding item:", error);
    }
  };

  const removePantryItem = async (itemName) => {
    try {
      const token =
        localStorage.getItem("token") ||
        localStorage.getItem("accessToken") ||
        "";

      const response = await fetch("/api/pantry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          items: [{ name: itemName }],
          action: "remove",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setPantry(data.pantry || data);
        // toast.success("Item removed from pantry");
      }
    } catch (error) {
      console.error("Error removing item:", error);
    }
  };

  useEffect(() => {
    if (isOpen && !user) {
      onClose();
      // router.push(`/${locale}/login`);
    }
    if (isOpen && user) {
      console.log("User tier:", user.tier);
    }
  }, [isOpen, user, onClose, locale]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.body.style.overflow = "unset";
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.body.style.overflow = "unset";
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, handleClickOutside]);

  // cancel auto renewal
  const handleCancelAutoRenewal = async () => {
    try {
      setIsCancelling(true);

      const token =
        localStorage.getItem("token") || localStorage.getItem("accessToken");

      if (!token) {
        toast.error("Please login to continue");
        return;
      }

      const response = await fetch("/api/billing/cancel-auto-renewal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Auto-renewal cancelled successfully");
        // Refresh user data - dispatch is available here
        dispatch(fetchUserData());
      } else {
        toast.error(data.error || "Failed to cancel auto-renewal");
      }
    } catch (error) {
      console.error("Cancel auto-renewal error:", error);
      toast.error("Failed to cancel auto-renewal");
    } finally {
      setIsCancelling(false);
    }
  };

  // Resume subscription
  const handleResumeSubscription = async () => {
    try {
      setIsResuming(true);

      const token =
        localStorage.getItem("token") || localStorage.getItem("accessToken");

      if (!token) {
        toast.error("Please login to continue");
        return;
      }

      const response = await fetch("/api/billing/resume-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Auto-renewal resumed successfully");
        // Refresh user data - dispatch is available here
        dispatch(fetchUserData());
      } else {
        toast.error(data.error || "Failed to resume subscription");
      }
    } catch (error) {
      console.error("Resume subscription error:", error);
      toast.error("Failed to resume subscription");
    } finally {
      setIsResuming(false);
    }
  };

  // Cancel subscription immediately
  const handleCancelImmediately = async () => {
    if (
      !confirm(
        "Are you sure you want to cancel immediately? You'll lose access to premium features right away.",
      )
    ) {
      return;
    }

    try {
      setIsCancelling(true);

      const token =
        localStorage.getItem("token") || localStorage.getItem("accessToken");

      if (!token) {
        toast.error("Please login to continue");
        return;
      }

      const response = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Subscription cancelled successfully");
        // Refresh user data - dispatch is available here
        dispatch(fetchUserData());
      } else {
        toast.error(data.error || "Failed to cancel subscription");
      }
    } catch (error) {
      console.error("Cancel subscription error:", error);
      toast.error("Failed to cancel subscription");
    } finally {
      setIsCancelling(false);
    }
  };

  // Confirm cancel auto-renewal toast
  const confirmCancelAutoRenewal = async () => {
    return new Promise((resolve) => {
      toast(
        <div className='p-4'>
          <p className='font-semibold text-gray-800 mb-2'>
            Cancel Auto-Renewal?
          </p>
          <p className='text-sm text-gray-600 mb-4'>
            Your {user?.tier === "tier2" ? "Plus" : "Premium"} plan will stay
            active until {formatDate(user?.subscription?.currentPeriodEnd)}.
            After that, you will be downgraded to the Free plan.
          </p>
          <div className='flex justify-end gap-2'>
            <button
              onClick={() => {
                toast.dismiss();
                resolve(false);
              }}
              className='px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition'>
              Keep Auto-Renewal
            </button>
            <button
              onClick={() => {
                toast.dismiss();
                resolve(true);
              }}
              className='px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition'>
              Cancel Auto-Renewal
            </button>
          </div>
        </div>,
        {
          position: "top-center",
          autoClose: false,
          closeOnClick: false,
          draggable: false,
          closeButton: false,
          theme: "light",
        },
      );
    });
  };

  if (!isOpen) return null;

  const tabs = [
    "Meal Plans",
    "Nutrition",
    "Calendar",
    // "Budget",
    "Pantry",
    // "Subscription Details",
  ];

  const tierConfig = {
    free: {
      name: "Free Plan",
      color: "bg-[#EDF7E0] text-black",
      displayName: "Free",
    },
    tier2: {
      name: "Plus Plan",
      color: "bg-[#D9ECF9] text-black",
      displayName: "Plus",
    },
    tier3: {
      name: "Premium Plan",
      color: "bg-black text-white",
      displayName: "Premium",
    },
  };

  const currentTier = user?.tier || "free";
  const tierInfo =
    currentTier === "admin"
      ? {
          name: "Admin Plan",
          color: "bg-purple-700 text-white",
          displayName: "Admin",
        }
      : tierConfig[currentTier] || tierConfig.free;

  // Helper function to get emoji for plan goal
  const getGoalEmoji = (goal) => {
    if (!goal) return "🍽️";

    const goalLower = goal.toLowerCase();
    switch (goalLower) {
      case "muscle gain":
        return "💪";
      case "weight loss":
        return "⚖️";
      case "healthy eating":
        return "🥗";
      case "family meals":
        return "👨‍👩‍👧‍👦";
      case "vegetarian":
        return "🥦";
      case "vegan":
        return "🌱";
      default:
        return "🍽️";
    }
  };

  // Count total meals in a plan
  const countTotalMeals = (plan) => {
    if (!plan?.days || !Array.isArray(plan.days)) return 0;

    return plan.days.reduce((total, day) => {
      if (day?.meals && Array.isArray(day.meals)) {
        return total + day.meals.length;
      }
      return total;
    }, 0);
  };

  // Calculate total nutrition across all saved plans
  const calculateTotalNutrition = () => {
    let totalCalories = 0;
    let totalProtein = 0;
    let planCount = 0;
    let usingRealData = false;

    // Filter out expired plans
    const activePlans = savedMealPlans.filter((plan) => !isPlanExpired(plan));

    activePlans.forEach((plan) => {
      plan.days?.forEach((day) => {
        day.meals?.forEach((meal) => {
          if (meal.nutrition) {
            // Check if this meal was validated by Spoonacular
            if (
              meal.spoonacularVerified === true ||
              meal.nutrition.spoonacularVerified === true
            ) {
              usingRealData = true;
            }

            totalCalories += meal.nutrition.calories || 0;
            totalProtein += meal.nutrition.protein_g || 0;
          }
        });
      });
      planCount++;
    });

    return {
      totalCalories: Math.round(totalCalories),
      totalProtein: Math.round(totalProtein),
      averageCalories:
        planCount > 0 ? Math.round(totalCalories / planCount) : 0,
      planCount: activePlans.length,
      usingRealData: usingRealData, // This should now be TRUE
    };
  };
  // Calculate total budget
  const calculateBudget = () => {
    let totalCost = 0;
    const budgetLevels = {
      Low: 50,
      Medium: 75,
      High: 100,
    };

    savedMealPlans.forEach((plan) => {
      const budgetLevel = plan.inputs?.budget_level || "Medium";
      const days = plan.days?.length || 0;
      const portions = plan.inputs?.portions || 2;

      // Simple calculation: budget level * days * portions
      const dailyCost = budgetLevels[budgetLevel] || 75;
      totalCost += dailyCost * days * portions;
    });

    return {
      totalCost: Math.round(totalCost),
      averageDailyCost:
        savedMealPlans.length > 0
          ? Math.round(totalCost / savedMealPlans.length)
          : 0,
    };
  };

  // Get favorite recipes
  const getFavoriteRecipes = () => {
    const favorites = [];
    savedMealPlans.forEach((plan) => {
      plan.days?.forEach((day) => {
        day.meals?.forEach((meal) => {
          if (meal.recipeName) {
            favorites.push({
              name: meal.recipeName,
              planTitle: plan.title,
              mealType: meal.mealType,
              cookingTime: meal.cookingTime,
            });
          }
        });
      });
    });

    // Remove duplicates
    const uniqueFavorites = [];
    const seen = new Set();

    favorites.forEach((fav) => {
      const key = `${fav.name}-${fav.mealType}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueFavorites.push(fav);
      }
    });

    return uniqueFavorites.slice(0, 10); // Return top 10
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch (e) {
      return "Invalid date";
    }
  };

  // Check if plan is expired
  const isPlanExpired = (plan) => {
    if (!plan?.expiresAt) return false;
    const now = new Date();
    const expires = new Date(plan.expiresAt);
    return now > expires;
  };
  // delete saved meal plan
  const deleteMealPlan = async (planId) => {
    try {
      const confirmPromise = new Promise((resolve) => {
        setIsConfirmingDelete(true);
        toast(
          <div className='p-4'>
            <p className='font-semibold text-gray-800 mb-2'>
              Delete Meal Plan?
            </p>
            <p className='text-gray-600 text-sm mb-4'>
              Are you sure you want to delete this meal plan? This action cannot
              be undone.
            </p>
            <div className='flex gap-2 justify-end'>
              <button
                onClick={() => {
                  toast.dismiss();
                  setIsConfirmingDelete(false);
                  resolve(false);
                }}
                className='px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition'>
                Cancel
              </button>
              <button
                onClick={() => {
                  toast.dismiss();
                  setIsConfirmingDelete(false);
                  resolve(true);
                }}
                className='px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition'>
                Delete
              </button>
            </div>
          </div>,
          {
            position: "top-center",
            autoClose: false,
            closeOnClick: false,
            draggable: false,
            closeButton: false,
            theme: "light",
          },
        );
      });

      const confirmed = await confirmPromise;

      if (!confirmed) {
        return;
      }

      const token =
        localStorage.getItem("token") || localStorage.getItem("accessToken");

      // Show loading toast
      const loadingToast = toast.loading("Deleting meal plan...", {
        position: "top-right",
      });

      const response = await fetch(`/api/plans/${planId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      // Dismiss loading toast
      toast.dismiss(loadingToast);

      if (response.ok) {
        // Remove from state
        setSavedMealPlans((prev) => prev.filter((plan) => plan._id !== planId));

        // Show success toast
        toast.success("Meal plan deleted successfully!", {
          position: "top-right",
          autoClose: 3000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "light",
        });
      } else {
        const errorData = await response.json();

        // Show error toast
        toast.error(errorData.error || "Failed to delete meal plan", {
          position: "top-right",
          autoClose: 4000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "light",
        });

        throw new Error(errorData.error || "Failed to delete");
      }
    } catch (error) {
      console.error(" Error deleting meal plan:", error);

      // Show generic error toast
      toast.error("Failed to delete meal plan. Please try again.", {
        position: "top-right",
        autoClose: 4000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "light",
      });
    } finally {
      setIsConfirmingDelete(false); // safety net
    }
  };

  // Get stats
  const nutritionStats = calculateTotalNutrition();

  const budgetStats = calculateBudget();
  const favoriteRecipes = getFavoriteRecipes();

  // Render different content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "Nutrition":
        return (
          <div className='space-y-6 mb-72'>
            <div className='mt-4 bg-green-50 border border-green-200 rounded-lg p-4'>
              <div className='flex items-center gap-2'>
                <div className='w-3 h-3 bg-green-500 rounded-full'></div>
                <p className='text-green-700 font-medium'>
                  Using verified nutrition data from Spoonacular
                </p>
              </div>
              <p className='text-green-600 text-sm mt-1'>
                All nutrition information is validated by Spoonacular API for
                accuracy
              </p>
            </div>
            <div className='grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4'>
              <div className='bg-blue-50 p-6 rounded-xl'>
                <p className='text-sm text-blue-600 font-medium'>
                  Total Calories
                </p>
                <p className='text-3xl font-bold text-gray-900'>
                  {nutritionStats.totalCalories}
                </p>
                <p className='text-xs text-gray-500'>Across all saved plans</p>
              </div>
              <div className='bg-green-50 p-6 rounded-xl'>
                <p className='text-sm text-green-600 font-medium'>
                  Total Protein
                </p>
                <p className='text-3xl font-bold text-gray-900'>
                  {nutritionStats.totalProtein}g
                </p>
                <p className='text-xs text-gray-500'>Across all saved plans</p>
              </div>
              <div className='bg-purple-50 p-6 rounded-xl'>
                <p className='text-sm text-purple-600 font-medium'>
                  Average Calories
                </p>
                <p className='text-3xl font-bold text-gray-900'>
                  {nutritionStats.averageCalories}
                </p>
                <p className='text-xs text-gray-500'>Per meal plan</p>
              </div>
              <div className='bg-amber-50 p-6 rounded-xl'>
                <p className='text-sm text-amber-600 font-medium'>
                  Meals Analyzed
                </p>
                <p className='text-3xl font-bold text-gray-900'>
                  {nutritionStats.planCount}
                </p>
                <p className='text-xs text-gray-500'>
                  Total meals in saved plans
                </p>
              </div>
            </div>

            <div className='bg-white border border-gray-200 rounded-xl p-6'>
              <h3 className='text-xl font-semibold text-gray-900 mb-4'>
                Nutrition Breakdown
              </h3>
              <div className='space-y-4'>
                <div>
                  <div className='flex justify-between mb-1'>
                    <span className='text-sm font-medium text-gray-700'>
                      Protein
                    </span>
                    <span className='text-sm font-medium text-gray-900'>
                      {nutritionStats.totalProtein}g
                    </span>
                  </div>
                  <div className='w-full bg-gray-200 rounded-full h-2'>
                    <div
                      className='bg-green-500 h-2 rounded-full'
                      style={{
                        width: `${Math.min(
                          100,
                          (nutritionStats.totalProtein / 500) * 100,
                        )}%`,
                      }}></div>
                  </div>
                </div>
                <div>
                  <div className='flex justify-between mb-1'>
                    <span className='text-sm font-medium text-gray-700'>
                      Carbs
                    </span>
                    <span className='text-sm font-medium text-gray-900'>
                      {nutritionStats.totalCarbs}g
                    </span>
                  </div>
                  <div className='w-full bg-gray-200 rounded-full h-2'>
                    <div
                      className='bg-blue-500 h-2 rounded-full'
                      style={{
                        width: `${Math.min(
                          100,
                          (nutritionStats.totalCarbs / 1000) * 100,
                        )}%`,
                      }}></div>
                  </div>
                </div>
                <div>
                  <div className='flex justify-between mb-1'>
                    <span className='text-sm font-medium text-gray-700'>
                      Fat
                    </span>
                    <span className='text-sm font-medium text-gray-900'>
                      {nutritionStats.totalFat}g
                    </span>
                  </div>
                  <div className='w-full bg-gray-200 rounded-full h-2'>
                    <div
                      className='bg-yellow-500 h-2 rounded-full'
                      style={{
                        width: `${Math.min(
                          100,
                          (nutritionStats.totalFat / 300) * 100,
                        )}%`,
                      }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case "Pantry":
        return (
          <div className='space-y-6 mb-72'>
            {/* Header */}
            <div>
              <h1 className='text-2xl font-bold text-gray-900'>My Pantry</h1>
              <p className='text-gray-600 mt-2'>
                Manage items you already have at home. These will be excluded
                from grocery lists when pantry toggle is enabled.
              </p>
            </div>

            {/* Upgrade message for free users */}
            {user?.tier === "free" ? (
              <div className='bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center'>
                <h2 className='text-xl font-semibold text-yellow-800 mb-2'>
                  Pantry Feature Unlocked
                </h2>
                <p className='text-yellow-700 mb-4'>
                  The pantry feature is only available for Plus and Premium
                  users.
                </p>
                <button
                  onClick={() => {
                    onClose();
                    router.push(`/${locale}/#pricing`);
                  }}
                  className='inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition'>
                  Upgrade Now
                </button>
              </div>
            ) : (
              <>
                {/* Add Item Form */}
                <div className='bg-white rounded-xl shadow-md p-6'>
                  <h2 className='text-xl font-semibold text-gray-900 mb-4'>
                    Add New Item
                  </h2>

                  <div className='grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-1'>
                        Item Name *
                      </label>
                      <input
                        type='text'
                        value={newPantryItem.name}
                        onChange={(e) =>
                          setNewPantryItem({
                            ...newPantryItem,
                            name: e.target.value,
                          })
                        }
                        placeholder='e.g., Rice, Olive Oil, Eggs'
                        className='w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500'
                      />
                    </div>

                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-1'>
                        Quantity
                      </label>
                      <input
                        type='number'
                        min='0.1'
                        step='0.1'
                        value={newPantryItem.quantity}
                        onChange={(e) =>
                          setNewPantryItem({
                            ...newPantryItem,
                            quantity: parseFloat(e.target.value) || 1,
                          })
                        }
                        className='w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500'
                      />
                    </div>

                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-1'>
                        Unit
                      </label>
                      <select
                        value={newPantryItem.unit}
                        onChange={(e) =>
                          setNewPantryItem({
                            ...newPantryItem,
                            unit: e.target.value,
                          })
                        }
                        className='w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500'>
                        <option value='unit'>unit</option>
                        <option value='cup'>cup</option>
                        <option value='tbsp'>tbsp</option>
                        <option value='tsp'>tsp</option>
                        <option value='oz'>oz</option>
                        <option value='lb'>lb</option>
                        <option value='kg'>kg</option>
                        <option value='g'>g</option>
                        <option value='ml'>ml</option>
                        <option value='l'>l</option>
                      </select>
                    </div>

                    <div className='flex items-end'>
                      <button
                        onClick={addPantryItem}
                        className='w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition font-medium'>
                        Add to Pantry
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pantry Items */}
                {pantryLoading ? (
                  <div className='flex justify-center items-center h-64'>
                    <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-green-500'></div>
                  </div>
                ) : pantry?.items && pantry.items.length > 0 ? (
                  <div className='bg-white rounded-xl shadow-md p-6'>
                    <div className='flex justify-between items-center mb-6'>
                      <h2 className='text-xl font-semibold text-gray-900'>
                        Pantry Items ({pantry.items.length})
                      </h2>
                      <span className='text-sm text-gray-500'>
                        Last updated:{" "}
                        {new Date(pantry.lastSynced).toLocaleDateString()}
                      </span>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
                      {pantry.items.map((item, index) => (
                        <div
                          key={index}
                          className='border border-gray-200 rounded-lg p-4 hover:border-green-300 transition'>
                          <div className='flex justify-between items-start mb-2'>
                            <div>
                              <h3 className='font-medium text-gray-900'>
                                {item.name}
                              </h3>
                              <p className='text-sm text-gray-600'>
                                {item.quantity} {item.unit}
                              </p>
                            </div>
                            <button
                              onClick={() => removePantryItem(item.name)}
                              className='text-red-600 hover:text-red-800 text-sm'>
                              Remove
                            </button>
                          </div>

                          <div className='flex items-center justify-between text-sm'>
                            <span className='bg-gray-100 text-gray-800 px-2 py-1 rounded'>
                              {item.category || "Uncategorized"}
                            </span>
                            <span className='text-gray-500'>
                              {new Date(item.lastUpdated).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className='bg-white rounded-xl shadow-md p-8 text-center'>
                    <div className='text-gray-400 text-6xl mb-4'>🏪</div>
                    <h3 className='text-xl font-semibold text-gray-900 mb-2'>
                      Your pantry is empty
                    </h3>
                    <p className='text-gray-600 mb-6'>
                      Add items you already have at home to exclude them from
                      grocery lists.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        );

      case "Calendar":
        // Get current date info
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // 0-indexed (0 = January)

        // Get first day of the month (0 = Sunday, 1 = Monday, etc.)
        const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

        // Get number of days in the current month
        const daysInMonth = new Date(
          currentYear,
          currentMonth + 1,
          0,
        ).getDate();

        // Get number of days in the previous month
        const daysInPrevMonth = new Date(
          currentYear,
          currentMonth,
          0,
        ).getDate();

        return (
          <div className='space-y-6 mb-72'>
            <div className='bg-white border border-gray-200 rounded-xl p-6'>
              <h3 className='text-xl font-semibold text-gray-900 mb-4'>
                Meal Plan Calendar -{" "}
                {today.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </h3>
              <div className='grid grid-cols-7 gap-1 sm:gap-2 mb-6'>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (day) => (
                    <div
                      key={day}
                      className='text-center text-xs sm:text-sm font-medium text-gray-700 py-1 sm:py-2'>
                      {day.substring(0, 1)}
                      <span className='hidden sm:inline'>
                        {day.substring(1)}
                      </span>
                    </div>
                  ),
                )}

                {/* Previous month's trailing days */}
                {Array.from({ length: firstDayOfMonth }).map((_, index) => {
                  const day = daysInPrevMonth - firstDayOfMonth + index + 1;
                  return (
                    <div
                      key={`prev-${index}`}
                      className='md:h-20 border border-gray-200 rounded-lg p-2 bg-gray-50'>
                      <div className='text-sm font-medium text-gray-400'>
                        {day}
                      </div>
                    </div>
                  );
                })}

                {/* Current month days */}
                {Array.from({ length: daysInMonth }).map((_, index) => {
                  const day = index + 1;
                  const isToday =
                    day === today.getDate() &&
                    currentMonth === new Date().getMonth() &&
                    currentYear === new Date().getFullYear();

                  return (
                    <div
                      key={day}
                      className={`md:h-20 border border-gray-200 rounded-lg p-2 hover:bg-gray-50 ${
                        isToday ? "bg-blue-50 border-blue-200" : ""
                      }`}>
                      <div className='text-sm font-medium text-gray-700'>
                        {day}
                        {isToday && (
                          <span className='hidden md:flex ml-1 text-xs text-blue-600'>
                            (Today)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Next month's leading days (to fill the grid) */}
                {Array.from({ length: 42 - firstDayOfMonth - daysInMonth }).map(
                  (_, index) => {
                    const day = index + 1;
                    return (
                      <div
                        key={`next-${index}`}
                        className='md:h-20 border border-gray-200 rounded-lg p-2 bg-gray-50'>
                        <div className='text-sm font-medium text-gray-400'>
                          {day}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>

              <div className='space-y-3'>
                <h4 className='font-semibold text-gray-900'>
                  Upcoming Expiring Plans
                </h4>
                {savedMealPlans
                  .filter((plan) => !isPlanExpired(plan))
                  .slice(0, 3)
                  .map((plan) => (
                    <div
                      key={plan._id}
                      className='flex items-center justify-between p-3 bg-yellow-50 rounded-lg'>
                      <div>
                        <p className='font-medium text-gray-900'>
                          {plan.title}
                        </p>
                        <p className='text-sm text-gray-600'>
                          Expires: {formatDate(plan.expiresAt)}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        );
      // later for phase 2
      // case "Budget":
      //   return (
      //     <div className='space-y-6 mb-72'>
      //       <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
      //         <div className='bg-green-50 p-6 rounded-xl'>
      //           <div className='flex items-center gap-3 mb-3'>
      //             <DollarSign className='w-6 h-6 text-green-600' />
      //             <p className='text-sm text-green-600 font-medium'>
      //               Total Estimated Cost
      //             </p>
      //           </div>
      //           <p className='text-3xl font-bold text-gray-900'>
      //             ${budgetStats.totalCost}
      //           </p>
      //           <p className='text-xs text-gray-500'>
      //             For all saved meal plans
      //           </p>
      //         </div>

      //         <div className='bg-blue-50 p-6 rounded-xl'>
      //           <div className='flex items-center gap-3 mb-3'>
      //             <DollarSign className='w-6 h-6 text-blue-600' />
      //             <p className='text-sm text-blue-600 font-medium'>
      //               Average Daily Cost
      //             </p>
      //           </div>
      //           <p className='text-3xl font-bold text-gray-900'>
      //             ${budgetStats.averageDailyCost}
      //           </p>
      //           <p className='text-xs text-gray-500'>Per plan</p>
      //         </div>

      //         <div className='bg-purple-50 p-6 rounded-xl'>
      //           <div className='flex items-center gap-3 mb-3'>
      //             <Utensils className='w-6 h-6 text-purple-600' />
      //             <p className='text-sm text-purple-600 font-medium'>
      //               Plans by Budget Level
      //             </p>
      //           </div>
      //           <p className='text-3xl font-bold text-gray-900'>
      //             {
      //               savedMealPlans.filter(
      //                 (p) => p.inputs?.budget_level === "Low",
      //               ).length
      //             }{" "}
      //             Low
      //           </p>
      //           <p className='text-xs text-gray-500'>
      //             {
      //               savedMealPlans.filter(
      //                 (p) => p.inputs?.budget_level === "Medium",
      //               ).length
      //             }{" "}
      //             Medium •
      //             {
      //               savedMealPlans.filter(
      //                 (p) => p.inputs?.budget_level === "High",
      //               ).length
      //             }{" "}
      //             High
      //           </p>
      //         </div>
      //       </div>

      //       <div className='bg-white border border-gray-200 rounded-xl p-6'>
      //         <h3 className='text-xl font-semibold text-gray-900 mb-4'>
      //           Budget Breakdown
      //         </h3>
      //         <div className='space-y-4'>
      //           {savedMealPlans.slice(0, 5).map((plan) => {
      //             const budgetLevel = plan.inputs?.budget_level || "Medium";
      //             const budgetColors = {
      //               Low: "bg-green-500",
      //               Medium: "bg-yellow-500",
      //               High: "bg-red-500",
      //             };

      //             return (
      //               <div
      //                 key={plan._id}
      //                 className='flex items-center justify-between'>
      //                 <div className='flex-1'>
      //                   <p className='font-medium text-gray-900'>
      //                     {plan.title}
      //                   </p>
      //                   <p className='text-sm text-gray-600'>
      //                     {plan.days?.length || 0} days •{" "}
      //                     {plan.inputs?.portions || 2} portions
      //                   </p>
      //                 </div>
      //                 <div className='flex items-center gap-4'>
      //                   <span
      //                     className={`px-3 py-1 rounded-full text-sm font-medium ${
      //                       budgetLevel === "Low"
      //                         ? "bg-green-100 text-green-800"
      //                         : budgetLevel === "Medium"
      //                           ? "bg-yellow-100 text-yellow-800"
      //                           : "bg-red-100 text-red-800"
      //                     }`}>
      //                     {budgetLevel} Budget
      //                   </span>
      //                   <span className='font-semibold text-gray-900'>
      //                     $
      //                     {budgetLevel === "Low"
      //                       ? 50
      //                       : budgetLevel === "High"
      //                         ? 100
      //                         : 75}
      //                   </span>
      //                 </div>
      //               </div>
      //             );
      //           })}
      //         </div>
      //       </div>
      //     </div>
      //   );

      case "Pantry":
        // case "Subscription Details":
        return (
          <div className='space-y-6 mb-72'>
            {/* Subscription Overview */}
            <div className='bg-white border border-gray-200 rounded-xl p-6'>
              <div className='flex justify-between items-center mb-6'>
                <h3 className='text-xl font-semibold text-gray-900'>
                  Subscription Details
                </h3>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    user?.subscription?.status === "active"
                      ? "bg-green-100 text-green-800"
                      : user?.subscription?.status === "past_due"
                        ? "bg-yellow-100 text-yellow-800"
                        : user?.subscription?.status === "canceled"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                  }`}>
                  {user?.subscription?.status
                    ? user.subscription.status.charAt(0).toUpperCase() +
                      user.subscription.status.slice(1)
                    : "Inactive"}
                </span>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                {/* Plan Details */}
                <div className='space-y-4'>
                  <div>
                    <p className='text-sm text-gray-500 mb-1'>Plan</p>
                    <p className='text-lg font-semibold text-gray-900'>
                      {user?.subscription?.tier === "tier2"
                        ? "PrepCart Plus"
                        : user?.subscription?.tier === "tier3"
                          ? "PrepCart Premium"
                          : "Free Plan"}
                    </p>
                  </div>

                  <div>
                    <p className='text-sm text-gray-500 mb-1'>Billing Cycle</p>
                    <p className='text-lg font-semibold text-gray-900'>
                      {user?.subscription?.tier === "tier2"
                        ? "$4.99 / month"
                        : user?.subscription?.tier === "tier3"
                          ? "$9.99 / month"
                          : "Free"}
                    </p>
                  </div>

                  <div>
                    <p className='text-sm text-gray-500 mb-1'>
                      Swaps Available
                    </p>
                    <p className='text-lg font-semibold text-gray-900'>
                      {user?.swapsUsed || 0} / {user?.swapsAllowed || 1} used
                    </p>
                  </div>
                </div>

                {/* Dates */}
                <div className='space-y-4'>
                  <div>
                    <p className='text-sm text-gray-500 mb-1'>
                      Subscription Started
                    </p>
                    <p className='text-lg font-semibold text-gray-900'>
                      {user?.subscription?.startedAt
                        ? formatDate(user.subscription.startedAt)
                        : formatDate(user?.createdAt)}
                    </p>
                  </div>

                  <div>
                    <p className='text-sm text-gray-500 mb-1'>
                      {user?.subscription?.cancelAtPeriodEnd
                        ? "Access Ends On"
                        : "Next Billing Date"}
                    </p>
                    <p className='text-lg font-semibold text-gray-900'>
                      {user?.subscription?.currentPeriodEnd
                        ? formatDate(user.subscription.currentPeriodEnd)
                        : "N/A"}
                    </p>
                    {user?.subscription?.cancelAtPeriodEnd && (
                      <p className='text-sm text-orange-600 mt-1'>
                        Auto-renewal is cancelled
                      </p>
                    )}
                  </div>

                  <div>
                    <p className='text-sm text-gray-500 mb-1'>
                      Stripe Customer ID
                    </p>
                    <p className='text-sm font-medium text-gray-900 truncate'>
                      {user?.stripeCustomerId || "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Billing History */}
            {user?.subscription?.lastInvoice && (
              <div className='bg-white border border-gray-200 rounded-xl p-6'>
                <h3 className='text-xl font-semibold text-gray-900 mb-6'>
                  Billing History
                </h3>

                <div className='space-y-4'>
                  {/* Latest Invoice */}
                  <div className='border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors'>
                    <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                      <div className='flex-1'>
                        <div className='flex items-center gap-3 mb-2'>
                          <div className='w-3 h-3 bg-green-500 rounded-full'></div>
                          <span className='font-medium text-gray-900'>
                            Latest Payment
                          </span>
                        </div>
                        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-sm'>
                          <div>
                            <p className='text-gray-500'>Amount</p>
                            <p className='font-semibold text-gray-900'>
                              $
                              {(
                                user.subscription.lastInvoice.amountPaid / 100
                              ).toFixed(2)}{" "}
                              {user.subscription.lastInvoice.currency.toUpperCase()}
                            </p>
                          </div>
                          <div>
                            <p className='text-gray-500'>Date</p>
                            <p className='font-semibold text-gray-900'>
                              {formatDate(user.subscription.lastInvoice.paidAt)}
                            </p>
                          </div>
                          <div>
                            <p className='text-gray-500'>Invoice ID</p>
                            <p className='font-medium text-gray-900 text-sm '>
                              {user.subscription.lastInvoice.invoiceId}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className='flex flex-col sm:flex-row gap-2'>
                        <a
                          href={user.subscription.lastInvoice.hostedInvoiceUrl}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm'>
                          <svg
                            className='w-4 h-4'
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'>
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth={2}
                              d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
                            />
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth={2}
                              d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
                            />
                          </svg>
                          View Invoice
                        </a>
                        <a
                          href={user.subscription.lastInvoice.invoicePdf}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='inline-flex items-center justify-center gap-2 bg-gray-800 hover:bg-black text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm'>
                          <svg
                            className='w-4 h-4'
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'>
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth={2}
                              d='M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
                            />
                          </svg>
                          Download PDF
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Invoice Details */}
                  <div className='bg-gray-50 rounded-lg p-4'>
                    <h4 className='font-medium text-gray-900 mb-3'>
                      Invoice Details
                    </h4>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-sm'>
                      <div>
                        <p className='text-gray-500'>Payment Method</p>
                        <p className='font-medium text-gray-900'>
                          Credit Card (Stripe)
                        </p>
                      </div>
                      <div>
                        <p className='text-gray-500'>Payment Status</p>
                        <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800'>
                          Paid
                        </span>
                      </div>
                      <div>
                        <p className='text-gray-500'>Subscription Period</p>
                        <p className='font-medium text-gray-900'>
                          {formatDate(
                            user.subscription?.startedAt || user.createdAt,
                          )}{" "}
                          - {formatDate(user.subscription?.currentPeriodEnd)}
                        </p>
                      </div>
                      <div>
                        <p className='text-gray-500'>Auto-Renewal</p>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            user.subscription?.cancelAtPeriodEnd
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-green-100 text-green-800"
                          }`}>
                          {user.subscription?.cancelAtPeriodEnd
                            ? "Cancelled"
                            : "Active"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Manage Subscription Section */}
            <div className='bg-white border border-gray-200 rounded-xl p-6'>
              <h3 className='text-xl font-semibold text-gray-900 mb-4'>
                Manage Subscription
              </h3>

              <div className='space-y-4'>
                {/* Current Status */}
                <div className='flex items-center justify-between p-3 bg-gray-50 rounded-lg'>
                  <div>
                    <p className='font-medium text-gray-900'>
                      Auto-Renewal Status
                    </p>
                    <p className='text-sm text-gray-600'>
                      {user?.subscription?.cancelAtPeriodEnd
                        ? "Will not renew after current period"
                        : "Will automatically renew on next billing date"}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      user?.subscription?.cancelAtPeriodEnd
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-green-100 text-green-800"
                    }`}>
                    {user?.subscription?.cancelAtPeriodEnd ? "Off" : "On"}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                  {!user?.subscription?.cancelAtPeriodEnd ? (
                    <button
                      onClick={async () => {
                        const confirmed = await confirmCancelAutoRenewal();
                        if (!confirmed) return;
                        await handleCancelAutoRenewal();
                      }}
                      disabled={isCancelling}
                      className={`w-full py-3 border rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                        isCancelling
                          ? "bg-yellow-100 border-yellow-300 text-yellow-700 cursor-not-allowed"
                          : "bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100"
                      }`}>
                      {isCancelling ? (
                        <>
                          <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-700'></div>
                          Processing...
                        </>
                      ) : (
                        "Cancel Auto-Renewal"
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleResumeSubscription}
                      disabled={isResuming}
                      className={`w-full py-3 border rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                        isResuming
                          ? "bg-green-100 border-green-300 text-green-700 cursor-not-allowed"
                          : "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                      }`}>
                      {isResuming ? (
                        <>
                          <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-green-700'></div>
                          Processing...
                        </>
                      ) : (
                        "Resume Auto-Renewal"
                      )}
                    </button>
                  )}

                  <button
                    onClick={() => {
                      onClose();
                      router.push(`/${locale}/#pricing`);
                    }}
                    className='w-full py-3 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded-lg font-medium transition-colors'>
                    {user?.tier === "tier2"
                      ? "Upgrade to Premium"
                      : user?.tier === "tier3"
                        ? "Downgrade to Plus"
                        : "View Plans"}
                  </button>

                  <button
                    onClick={handleCancelImmediately}
                    disabled={isCancelling}
                    className={`w-full py-3 border rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                      isCancelling
                        ? "bg-red-100 border-red-300 text-red-700 cursor-not-allowed"
                        : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                    }`}>
                    {isCancelling ? (
                      <>
                        <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-red-700'></div>
                        Processing...
                      </>
                    ) : (
                      "Cancel Immediately"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      case "Meal Plans":
      default:
        // console.log("Saved meal plans", savedMealPlans);

        const quickSavedPlans = savedMealPlans.filter(
          (plan) => plan.isSaved === true && plan.isQuickPlan === true,
        );

        const regularSavedPlans = savedMealPlans.filter(
          (plan) => plan.isSaved === true && plan.isQuickPlan !== true,
        );

        // Debug logging
        // console.log("Dashboard - Quick Plans:", quickSavedPlans);
        // console.log("Dashboard - Regular Plans:", regularSavedPlans);

        return (
          <>
            <div className='mb-72'>
              {/* Plan Status Card - Always show */}
              <div className='mb-8 bg-white border border-gray-200 rounded-xl p-6'>
                <div className='flex items-center justify-between mb-4'>
                  <h2 className='text-2xl font-bold text-gray-900'>
                    Your Plan
                  </h2>
                  <div
                    className={`px-4 py-2 rounded-lg ${tierInfo.color} font-medium`}>
                    {tierInfo.displayName} Plan
                  </div>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
                  <div className='bg-blue-50 p-4 rounded-xl'>
                    <p className='text-sm text-blue-600 font-medium'>
                      Monthly Plans Used
                    </p>
                    <p className='text-2xl font-bold text-gray-900'>
                      {user?.monthly_plan_count ||
                        user?.planGenerationCount ||
                        0}
                    </p>
                    <p className='text-xs text-gray-500'>This month</p>
                  </div>

                  <div className='bg-green-50 p-4 rounded-xl'>
                    <p className='text-sm text-green-600 font-medium'>
                      Swaps Used
                    </p>
                    <p className='text-2xl font-bold text-gray-900'>
                      {user?.preferences?.swapsUsed || 0}
                    </p>
                    <p className='text-xs text-gray-500'>
                      of {user?.preferences?.swapsAllowed || 3} allowed
                    </p>
                  </div>

                  <div className='bg-purple-50 p-4 rounded-xl'>
                    <p className='text-sm text-purple-600 font-medium'>
                      Saved Plans
                    </p>
                    <p className='text-2xl font-bold text-gray-900'>
                      {savedMealPlans.length}
                    </p>
                    <p className='text-xs text-gray-500'>Total saved</p>
                  </div>

                  <div className='bg-amber-50 p-4 rounded-xl'>
                    <p className='text-sm text-amber-600 font-medium'>
                      Last Login
                    </p>
                    <p className='text-2xl font-bold text-gray-900'>
                      {user?.lastLogin ? formatDate(user.lastLogin) : "Never"}
                    </p>
                    <p className='text-xs text-gray-500'>Recent activity</p>
                  </div>
                </div>
              </div>

              {/* REGULAR SAVED PLANS SECTION */}
              {regularSavedPlans.length > 0 && (
                <div className='mb-8'>
                  <div className='flex items-center justify-between mb-6'>
                    <h2 className='text-2xl font-bold text-gray-900'>
                      Regular Saved Plans ({regularSavedPlans.length})
                    </h2>
                  </div>

                  <div className='grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6'>
                    {regularSavedPlans.map((plan) => {
                      const isExpired = isPlanExpired(plan);
                      return (
                        <div
                          key={plan._id}
                          className={`bg-white border rounded-xl p-6 hover:shadow-lg transition-shadow min-h-[400px] flex flex-col mb-8 ${
                            isExpired
                              ? "border-red-300 bg-red-50"
                              : "border-gray-200"
                          }`}>
                          {isExpired && (
                            <div className='mb-3 px-3 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full inline-flex items-center'>
                              <span className='h-2 w-2 bg-red-500 rounded-full mr-2'></span>
                              Expired
                            </div>
                          )}

                          <div className='flex items-start justify-between mb-4'>
                            <div className='flex items-center gap-3'>
                              <div className='text-3xl'>
                                {getGoalEmoji(plan.inputs?.goal)}
                              </div>
                              <div>
                                <h3 className='text-xl font-semibold text-gray-900'>
                                  {plan.title}
                                </h3>
                                <span className='text-xs px-2 py-1 bg-teal-100 text-teal-800 rounded-full'>
                                  {plan.inputs?.goal || "Custom Plan"}
                                </span>
                              </div>
                            </div>
                            <button className='p-2 hover:bg-gray-100 rounded-lg transition-colors'>
                              <Bookmark className='w-5 h-5 text-teal-600 fill-teal-600' />
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                deleteMealPlan(plan._id);
                              }}
                              className='p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600'
                              title='Delete plan'>
                              <svg
                                className='w-5 h-5'
                                fill='none'
                                stroke='currentColor'
                                viewBox='0 0 24 24'>
                                <path
                                  strokeLinecap='round'
                                  strokeLinejoin='round'
                                  strokeWidth={2}
                                  d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'
                                />
                              </svg>
                            </button>
                          </div>

                          <div className='space-y-2 mb-6 grow'>
                            <p className='text-sm text-gray-600'>
                              Created: {formatDate(plan.createdAt)}
                            </p>
                            <p className='text-sm text-gray-600'>
                              {countTotalMeals(plan)} meals •{" "}
                              {plan.days?.length || 0} days
                            </p>
                            <p className='text-sm text-gray-600'>
                              Portions: {plan.inputs?.portions || 2} • Budget:{" "}
                              {plan.inputs?.budget_level || "Medium"}
                            </p>
                            {plan.inputs?.cuisine && (
                              <p className='text-sm text-gray-600'>
                                Cuisine: {plan.inputs.cuisine}
                              </p>
                            )}
                          </div>

                          <div className='mt-auto'>
                            <Link
                              className='w-full block'
                              href={`/${locale}/plans/${plan._id}${
                                plan.groceryListId
                                  ? `?groceryListId=${plan.groceryListId}`
                                  : ""
                              }`}>
                              <button className='w-full bg-white border border-gray-300 text-gray-700 px-7 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors cursor-pointer'>
                                View Plan
                              </button>
                            </Link>
                          </div>

                          <div className='mt-4 pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-500'>
                            <span>
                              Swaps: {plan.swapsUsed || 0}/
                              {plan.swapsAllowed || 3}
                            </span>
                            <span>Source: {plan.source || "OpenAI"}</span>
                            <span>
                              {isExpired ? (
                                <span className='text-red-500'>Expired</span>
                              ) : plan.expiresAt ? (
                                `Expires: ${formatDate(plan.expiresAt)}`
                              ) : (
                                "No expiry"
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* QUICK SAVED PLANS SECTION */}
              {quickSavedPlans.length > 0 && (
                <div className='mb-8'>
                  <div className='flex items-center justify-between mb-6'>
                    <h2 className='text-2xl font-bold text-gray-900'>
                      Quick Saved Plans ({quickSavedPlans.length})
                    </h2>
                    <span className='text-sm text-gray-500'>
                      Generated from quick plan feature
                    </span>
                  </div>

                  <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                    {quickSavedPlans.map((plan) => {
                      const isExpired = isPlanExpired(plan);
                      return (
                        <div
                          key={plan._id}
                          className={`bg-white border border-blue-200 rounded-xl p-6 hover:shadow-lg transition-shadow min-h-[400px] flex flex-col ${
                            isExpired ? "border-red-300 bg-red-50" : ""
                          }`}>
                          {isExpired && (
                            <div className='mb-3 px-3 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full inline-flex items-center'>
                              <span className='h-2 w-2 bg-red-500 rounded-full mr-2'></span>
                              Expired
                            </div>
                          )}

                          <div className='flex items-start justify-between mb-4'>
                            <div className='flex items-center gap-3'>
                              <div className='text-3xl'>⚡</div>
                              <div>
                                <h3 className='text-xl font-semibold text-gray-900'>
                                  {plan.title}
                                </h3>
                                <span className='text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full'>
                                  Quick Plan
                                </span>
                              </div>
                            </div>
                            <button className='p-2 hover:bg-gray-100 rounded-lg transition-colors'>
                              <Bookmark className='w-5 h-5  text-teal-600 fill-teal-600' />
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                deleteMealPlan(plan._id);
                              }}
                              className='p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600'
                              title='Delete plan'>
                              <svg
                                className='w-5 h-5'
                                fill='none'
                                stroke='currentColor'
                                viewBox='0 0 24 24'>
                                <path
                                  strokeLinecap='round'
                                  strokeLinejoin='round'
                                  strokeWidth={2}
                                  d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'
                                />
                              </svg>
                            </button>
                          </div>

                          <div className='space-y-2 mb-6 grow'>
                            <p className='text-sm text-gray-600'>
                              Created: {formatDate(plan.createdAt)}
                            </p>
                            <p className='text-sm text-gray-600'>
                              {countTotalMeals(plan)} meals •{" "}
                              {plan.days?.length || 0} days
                            </p>
                            <p className='text-sm text-gray-600'>
                              {plan.swapsAllowed || 0} swaps available
                            </p>
                            {plan.source && (
                              <p className='text-sm text-gray-600'>
                                Source: {plan.source}
                              </p>
                            )}
                          </div>

                          <div className='mt-auto'>
                            <Link
                              className='w-full block'
                              href={`/${locale}/plans/${plan._id}`}>
                              <button className='w-full bg-white border border-gray-300 text-gray-700 px-7 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors cursor-pointer'>
                                View Quick Plan
                              </button>
                            </Link>
                          </div>

                          <div className='mt-4 pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-500'>
                            <span>
                              Swaps: {plan.swapsUsed || 0}/
                              {plan.swapsAllowed || 3}
                            </span>
                            <span>Source: {plan.source || "OpenAI"}</span>
                            <span>
                              {isExpired ? (
                                <span className='text-red-500'>Expired</span>
                              ) : plan.expiresAt ? (
                                `Expires: ${formatDate(plan.expiresAt)}`
                              ) : (
                                "30 days from creation"
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* EMPTY STATE */}
              {regularSavedPlans.length === 0 &&
                quickSavedPlans.length === 0 && (
                  <div className='text-center py-12 bg-gray-50 rounded-xl'>
                    <Bookmark className='w-16 h-16 text-gray-300 mx-auto mb-4' />
                    <h3 className='text-xl font-semibold text-gray-700 mb-2'>
                      No saved meal plans yet
                    </h3>
                    <p className='text-gray-500 mb-6'>
                      {currentTier === "free"
                        ? "Free users cannot save meal plans. Upgrade to Plus or Premium to save your plans."
                        : "Create and save your first meal plan to get started!"}
                    </p>
                    {currentTier === "free" ? (
                      <button
                        onClick={() => {
                          onClose();
                          router.push(`/${locale}/#pricing`);
                        }}
                        className='bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-medium'>
                        <Crown className='inline w-5 h-5 mr-2' />
                        Upgrade to Save Plans
                      </button>
                    ) : (
                      <button className='bg-teal-600 text-white px-6 py-3 rounded-lg font-medium'>
                        Create First Plan to View
                      </button>
                    )}
                  </div>
                )}
            </div>
          </>
        );
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 '>
      {/* Overlay */}
      <div className='absolute inset-0' onClick={onClose} />

      {/* Modal Content */}
      <div
        ref={modalRef}
        className='relative bg-white rounded-none md:rounded-2xl w-full h-screen max-h-[95vh] md:max-w-[1400px] md:max-h-[95vh] md:h-auto overflow-hidden flex flex-col shadow-2xl'
        onClick={(e) => e.stopPropagation()}>
        {/* Header with gradient background */}
        <div className='bg-linear-to-r from-teal-500 to-emerald-400 px-4 md:px-8 py-4 md:py-6 relative'>
          <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0'>
            <div>
              <h1 className='text-2xl md:text-3xl font-bold text-white mb-1'>
                {user?.name || "User"}s Dashboard
              </h1>
              <div className='flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2 sm:gap-3 text-white/90 text-sm'>
                <div className='flex items-center gap-1'>
                  <Mail className='w-4 h-4 shrink-0' />
                  <span className='truncate max-w-[220px] sm:max-w-[250px]'>
                    {user?.email}
                  </span>
                </div>
                {user?.province && (
                  <div className='flex items-center gap-1'>
                    <MapPin className='w-4 h-4 shrink-0' />
                    <span>{user.province}</span>
                  </div>
                )}
                {user?.createdAt && (
                  <div className='hidden sm:flex items-center gap-1'>
                    <Calendar className='w-4 h-4 shrink-0' />
                    <span>Member since {formatDate(user.createdAt)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className='flex items-center gap-2 self-end sm:self-center'>
              {/* Show Upgrade button only if not Premium */}
              {currentTier !== "tier3" && (
                <button
                  onClick={() => {
                    onClose();
                    router.push(`/${locale}/#pricing`);
                  }}
                  className='flex items-center gap-1 sm:gap-2 bg-orange-500 hover:bg-orange-600 text-white px-3 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold transition-colors shadow-lg text-sm sm:text-base'>
                  <Crown className='w-4 h-4 sm:w-5 sm:h-5 shrink-0' />
                  <span className='hidden sm:inline'>Upgrade to Premium</span>
                  <span className='sm:hidden'>↑</span>
                </button>
              )}

              <button
                onClick={onClose}
                className='p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-white shrink-0'
                aria-label='Close modal'>
                <X className='w-5 h-5 sm:w-6 sm:h-6' />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className='bg-gray-50 border-b border-gray-200 px-4 md:px-8 sm:px-8'>
          <div className='flex overflow-x-auto gap-4 md:gap-8 scrollbar-hide py-2'>
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-3 font-medium transition-colors relative whitespace-nowrap shrink-0 text-sm sm:text-base ${
                  activeTab === tab
                    ? "text-teal-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}>
                {tab}
                {activeTab === tab && (
                  <div className='absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600' />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className='flex-1 overflow-y-auto p-8 sm:p-6 md:p-8 max-h-[calc(100vh-200px)] sm:max-h-[650px]'>
          <div className='max-w-7xl mx-auto h-full'>
            {isInitialLoading ? (
              <div className='flex flex-col items-center justify-center h-[60vh] min-h-[400px]'>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mb-6'></div>
                <h3 className='text-xl font-medium text-gray-700 mb-2'>
                  Loading your dashboard
                </h3>
                <p className='text-gray-500'>
                  Fetching meal plans & pantry data...
                </p>
              </div>
            ) : (
              renderTabContent()
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
