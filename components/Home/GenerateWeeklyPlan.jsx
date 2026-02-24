"use client";

import { useEffect, useState } from "react";
import {
  PROVINCES,
  GOALS,
  BUDGET_LEVELS,
  SKILL_LEVELS,
  DIETARY_PREFERENCES,
  ALLERGIES,
} from "@/lib/types";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { IoIosArrowDown } from "react-icons/io";

export default function GenerateWeeklyPlan({ voiceText, onPlanGenerated }) {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const { user } = useSelector((state) => state.auth);
  const [isSwapping, setIsSwapping] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [freeLimitReached, setFreeLimitReached] = useState(false);

  const [swappingMeals, setSwappingMeals] = useState({});

  const t = useTranslations("generatePlan");
  const params = useParams();
  const locale = params.locale;
  const router = useRouter();

  const redirectToLoginAfterAlert = () => {
    const loginPath = locale ? `/${locale}/login` : "/login";

    toast.error("Login required to generate meal plans", {
      toastId: "generate-plan-login-required",
      autoClose: 1800,
    });

    setTimeout(() => {
      router.push(loginPath);
    }, 250);
  };

  // to recheck authentication token
  useEffect(() => {
    const checkAuth = () => {
      const token =
        localStorage.getItem("token") || localStorage.getItem("accessToken");
      if (!token && user) {
        if (user.token) {
          localStorage.setItem("token", user.token);
        }
      }
    };

    checkAuth();
  }, [user]);
  // Form state
  const [form, setForm] = useState(() => {
    // Access nested preferences
    const preferences = user?.preferences || {};

    return {
      province: user?.province || "Ontario",
      cuisine: "",
      goal: preferences?.goal || "", // From preferences
      budgetLevel: preferences?.budgetLevel || "medium", // From preferences
      portions: 2,
      mealsPerDay: 3,
      likes: Array.isArray(preferences?.likes)
        ? preferences.likes.join(", ")
        : "",
      dislikes: Array.isArray(preferences?.dislikes)
        ? preferences.dislikes.join(", ")
        : "",
      cookingMethod: Array.isArray(preferences?.cookingMethod)
        ? preferences.cookingMethod.join(", ")
        : "",
      maxCookingTime: 30,
      skillLevel: preferences?.skillLevel || "Beginner", // From preferences
      dietaryPreferences: Array.isArray(preferences?.dietaryPreferences)
        ? preferences.dietaryPreferences
        : [],
      allergies: Array.isArray(preferences?.allergies)
        ? preferences.allergies
        : [],
      days_count: !user || user?.tier === "free" ? 3 : 7,
    };
  });
  useEffect(() => {
    if (!voiceText) return;

    const text = voiceText.toLowerCase();

    setForm((prev) => ({
      ...prev,

      // province
      province: text.includes("alberta")
        ? "Alberta"
        : text.includes("british")
          ? "British Columbia"
          : text.includes("columbia")
            ? "British Columbia"
            : text.includes("manitoba")
              ? "Manitoba"
              : text.includes("New")
                ? "New Brunswick"
                : text.includes("Brunswick")
                  ? "New Brunswick"
                  : text.includes("yukon")
                    ? "Yukon"
                    : text.includes("nunavut")
                      ? "Nunavut"
                      : text.includes("quebec")
                        ? "Quebec"
                        : text.includes("columbia")
                          ? "British Columbia"
                          : prev.province,

      // Goal
      goal: text.includes("lose")
        ? "Weigth Loss"
        : text.includes("weight")
          ? "Weigth Loss"
          : text.includes("muscle")
            ? "Muscle Gain"
            : text.includes("healthy")
              ? "Healthy Eating"
              : text.includes("quick")
                ? "Quick Meals"
                : text.includes("family")
                  ? "Family Friendly"
                  : prev.goal,

      // level
      skillLevel: text.includes("beginner")
        ? "Beginner"
        : text.includes("intermediate")
          ? "Intermediate"
          : text.includes("expert")
            ? "Advanced"
            : text.includes("advanced")
              ? "Advanced"
              : prev.skillLevel,

      // Cuisine
      cuisine: text.includes("asian")
        ? "Asian"
        : text.includes("italian")
          ? "Italian"
          : text.includes("mexican")
            ? "Mexican"
            : text.includes("chinese")
              ? "Chinese"
              : text.includes("indian")
                ? "Indian"
                : prev.cuisine,

      // Budget
      budgetLevel:
        text.includes("cheap") || text.includes("low budget")
          ? "Low"
          : text.includes("medium") || text.includes("medium budget")
            ? "Medium"
            : text.includes("high") || text.includes("high budget")
              ? "High"
              : prev.budgetLevel,

      // allergies
      allergies: [
        ...new Set([
          ...prev.allergies,
          ...(text.includes("peanuts") ? ["Peanuts"] : []),
          ...(text.includes("fish") ? ["Fish"] : []),
          ...(text.includes("dairy") ? ["Dairy"] : []),
          ...(text.includes("soy") ? ["Soy"] : []),
          ...(text.includes("wheat") ? ["wheat"] : []),
          ...(text.includes("shellfish") ? ["Shellfish"] : []),
          ...(text.includes("eggs") ? ["Eggs"] : []),
        ]),
      ],
      // Dietary Preferences
      dietaryPreferences: [
        ...new Set([
          ...prev.dietaryPreferences,
          ...(text.includes("vegetarian") ? ["Vegetarian"] : []),
          ...(text.includes("vegan") ? ["Vegan"] : []),
          ...(text.includes("keto") ? ["Keto"] : []),
          ...(text.includes("paleo") ? ["Paleo"] : []),
          ...(text.includes("mediterranean") ? ["Mediterranean"] : []),
          ...(text.includes("gluten-free") ? ["Gluten-Free"] : []),
          ...(text.includes("dairy-free") ? ["Dairy-Free"] : []),
        ]),
      ],
    }));
  }, [voiceText]);

  // to auto-fill form with user preferences
  useEffect(() => {
    if (user && user.id) {
      const preferences = user.preferences || {};
      setForm((prev) => {
        const updatedForm = {
          ...prev,
          // Direct user fields
          province: user.province || prev.province,

          // Fields from preferences object
          goal: preferences.goal || prev.goal,
          budgetLevel: preferences.budgetLevel || prev.budgetLevel,
          skillLevel: preferences.skillLevel || prev.skillLevel,

          // Convert arrays to strings
          likes:
            Array.isArray(preferences.likes) && preferences.likes.length > 0
              ? preferences.likes.join(", ")
              : prev.likes,

          dislikes:
            Array.isArray(preferences.dislikes) &&
            preferences.dislikes.length > 0
              ? preferences.dislikes.join(", ")
              : prev.dislikes,

          cookingMethod:
            Array.isArray(preferences.cookingMethod) &&
            preferences.cookingMethod.length > 0
              ? preferences.cookingMethod.join(", ")
              : prev.cookingMethod,

          // Checkbox arrays
          dietaryPreferences:
            Array.isArray(preferences.dietaryPreferences) &&
            preferences.dietaryPreferences.length > 0
              ? preferences.dietaryPreferences
              : prev.dietaryPreferences,

          allergies:
            Array.isArray(preferences.allergies) &&
            preferences.allergies.length > 0
              ? preferences.allergies
              : prev.allergies,
        };

        return updatedForm;
      });

      // Only show toast if we actually filled something
      const hasPreferences =
        (Array.isArray(preferences.dietaryPreferences) &&
          preferences.dietaryPreferences.length > 0) ||
        (Array.isArray(preferences.allergies) &&
          preferences.allergies.length > 0) ||
        preferences.goal ||
        preferences.budgetLevel ||
        preferences.skillLevel;

      if (hasPreferences) {
        setTimeout(() => {
          // toast.success("Your saved preferences have been auto-filled!");
        }, 500);
      }
    }
  }, [user]);

  // Generate plan handler
  const handleSubmit = async (e) => {
    e.preventDefault();

    const token =
      localStorage.getItem("token") ||
      localStorage.getItem("accessToken") ||
      (user?.token ? user.token : null);

    if (!user || !token) {
      redirectToLoginAfterAlert();
      return;
    }

    setLoading(true);
    setError("");
    setGeneratingProgress(0);

    const progressInterval = setInterval(() => {
      setGeneratingProgress((prev) => {
        if (prev >= 90) return 90;
        return prev + 10;
      });
    }, 500);

    try {
      const requestBody = {
        province: form.province,
        goal: form.goal,
        cuisine: form.cuisine,
        budget_level: form.budgetLevel,
        portions: form.portions,
        meals_per_day: form.mealsPerDay,
        days_count: form.days_count,
        likes: form.likes,
        dislikes: form.dislikes,
        cooking_method: form.cookingMethod,
        max_cooking_time: form.maxCookingTime,
        skill_level: form.skillLevel,
        dietary_preferences: form.dietaryPreferences,
        allergies: form.allergies,
      };

      const response = await fetch("/api/plans/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.success === false) {
        clearInterval(progressInterval);
        setLoading(false);

        if (data.requiresLogin) {
          redirectToLoginAfterAlert();
        } else {
          toast.error(data.error || "Unable to generate plan");
        }

        // If it's a limit issue, show the upgrade warning
        if (data.limitReached) {
          setFreeLimitReached(true);
        }

        return; // don't generate anything
      }

      // If we get here, success must be true
      setPlan(data.plan);
      clearInterval(progressInterval);
      setGeneratingProgress(100);
      if (typeof onPlanGenerated === "function") {
        onPlanGenerated(true);
      }

      setPlan(data.plan);
      clearInterval(progressInterval);
      setGeneratingProgress(100);
    } catch (err) {
      clearInterval(progressInterval);
      console.error("Generate error:", err);
      toast.error(err.message || "Failed to generate plan");
      setError(err.message);
    } finally {
      setLoading(false);
      setTimeout(() => setGeneratingProgress(0), 1000);
    }
  };
  // Change form handler
  const handleChange = (e) => {
    const { name, value, type } = e.target;

    if (type === "checkbox") {
      const checked = e.target.checked;
      if (name === "dietaryPreferences" || name === "allergies") {
        setForm((prev) => ({
          ...prev,
          [name]: checked
            ? [...prev[name], value]
            : prev[name].filter((item) => item !== value),
        }));
      }
    } else {
      setForm((prev) => ({
        ...prev,
        [name]: type === "number" ? parseInt(value) : value,
      }));
    }
  };
  // Save plan
  const savePlan = async () => {
    try {
      if (!plan) {
        toast.warning("No plan to save!");
        return;
      }

      // Get user ID
      const userId = user?.id || user?._id;
      if (!user || !userId) {
        toast.error("Please login to save plans");
        return;
      }

      // free users can't save meal
      // const userId = user?.id || user?._id;
      // if (!user || user?.tier === "free") {
      //   toast.error("Upgrade to Plus or Premium to save plans");
      //   window.location.href = "/#pricing";
      //   return;
      // }

      // Prepare request body
      const requestBody = {
        planData: {
          ...plan,
          title: plan.title || `${plan.inputs?.goal || "Weekly"} Meal Plan`,
          days: plan.days || [],
          inputs: plan.inputs || {},
          swaps: plan.swaps || { allowed: 1, used: 0, remaining: 1 },
          tier: plan.tier || "free",
          source: plan.source || "openai",
          userId: plan.userId || userId,
          userEmail: plan.userEmail || user.email,
          swapsUsed: plan.swaps?.used || 0,
          swapsAllowed: plan.swaps?.allowed || 1,
          // Remove temporary ID if it exists
          ...(plan.id && plan.id.startsWith("temp_") && { tempId: plan.id }),
        },
        userId: userId,
        userEmail: user.email,
        userTier: user.tier || "free",
        source: plan.source || "openai",
      };

      const response = await fetch(`/api/plans/${plan.id}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success(result.message || "Plan saved successfully!");

        // Update plan state with database data
        setPlan({
          ...plan,
          id: result.plan?.id || plan.id, // Use real MongoDB ID if returned
          title: result.plan?.title || plan.title,
          isSaved: true,
          needsUpdate: false,
          expiresAt: result.plan?.expiresAt,
          swaps: {
            allowed: result.plan?.swapsAllowed || plan.swaps?.allowed || 1,
            used: result.plan?.swapsUsed || plan.swaps?.used || 0,
            remaining:
              (result.plan?.swapsAllowed || plan.swaps?.allowed || 1) -
              (result.plan?.swapsUsed || plan.swaps?.used || 0),
          },
          // Keep all other data
          days: plan.days,
          inputs: plan.inputs,
          tier: plan.tier,
          source: plan.source, // Preserve the source
        });

        if (typeof onPlanGenerated === "function") {
          onPlanGenerated(false); // no unsaved plan anymore
        }

        return result;
      } else {
        console.error("Save failed:", result);

        // More specific error messages
        if (
          result.error?.includes("source") ||
          result.error?.includes("enum")
        ) {
          toast.error("Database schema needs update. Please contact support.");
        } else {
          toast.error(result.error || "Failed to save plan");
        }
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Error: " + error.message);
    }
  };
  // Generate another plan
  const generateAnother = () => {
    setPlan(null);
    setError("");
    setForm({
      province: "Ontario",
      cuisine: "",
      goal: "",
      budgetLevel: "Medium",
      portions: 2,
      mealsPerDay: 3,
      likes: "",
      dislikes: "",
      cookingMethod: "",
      maxCookingTime: 30,
      skillLevel: "Beginner",
      dietaryPreferences: [],
      allergies: [],
      days_count: 7,
    });
  };
  // Generate grocery list
  const generateGroceryList = async () => {
    try {
      if (!plan || !plan.id) {
        toast.error("No plan available to generate grocery list");
        return;
      }

      // Check if user is logged in
      if (!user) {
        toast.error("Please login to generate grocery lists");
        return;
      }

      // Only after saving the meal, user can generate grocery list
      if (!plan.isSaved) {
        toast.error(
          "Please save the plan first before generating a grocery list",
        );
        return;
      }

      setLoading(true);

      // Get authentication token
      const token =
        localStorage.getItem("token") ||
        localStorage.getItem("accessToken") ||
        (user?.token ? user.token : null);

      if (!token) {
        toast.error("Authentication token missing. Please login again.");
        return;
      }

      const requestBody = {
        planId: plan.id,
        planData: plan,
        pantryToggle: false,
      };
      const response = await fetch("/api/groceryLists/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      // Check if response is JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response:", text.substring(0, 200));
        throw new Error(
          `Server returned non-JSON: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (response.ok) {
        toast.success("Grocery list generated successfully!");

        // Store in localStorage
        localStorage.setItem(
          "lastGroceryList",
          JSON.stringify(data.groceryList),
        );

        // Open grocery list page
        window.location.href = `/${locale}/grocery-list/${data.groceryList.id}`;

        return data.groceryList;
      } else {
        // Handle specific errors
        if (data.planNotSaved) {
          toast.error(
            "Please save the plan first before generating grocery list",
          );
        } else if (data.requiresUpgrade) {
          toast.error("Upgrade required for grocery list feature");
        } else if (response.status === 401) {
          toast.error("Authentication failed. Please login again.");
        } else {
          toast.error(data.error || "Failed to generate grocery list");
        }
      }
    } catch (error) {
      console.error("Grocery list error:", error);

      // Better error message
      if (error.message.includes("non-JSON")) {
        toast.error("Server error. Please check if the API endpoint exists.");
      } else {
        toast.error("Error generating grocery list: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };
  // swap meal
  const swapMeal = async (planId, mealIndex, dayIndex) => {
    // Create a unique key for this specific meal
    const mealKey = `${dayIndex}-${mealIndex}`;
    try {
      // setIsSwapping(true);

      setSwappingMeals((prev) => ({ ...prev, [mealKey]: true }));

      if (!user) {
        toast.error("Please login to swap meals");
        return null;
      }

      if (user.tier === "free") {
        toast.error("Upgrade to Plus or Premium to swap meals");
        return null;
      }

      // Check current swaps
      if (plan.swaps.remaining <= 0) {
        toast.error(
          `No swaps remaining! Used ${plan.swaps.used}/${plan.swaps.allowed}`,
        );
        return null;
      }

      const swapData = {
        dayIndex,
        mealIndex,
        userId: user?.id || user?._id,
        userEmail: user?.email,
        userTier: user?.tier || "free",
        planData: plan,
      };

      // console.log("Sending swap request:", { planId, dayIndex, mealIndex });

      const response = await fetch(`/api/plans/${planId}/swap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(swapData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Swap failed");
      }

      if (data.success) {
        toast.success(data.message);

        // Update plan state
        setPlan((prev) => {
          const updatedDays = [...prev.days];

          // Update the specific meal
          updatedDays[dayIndex].meals[mealIndex] = {
            ...data.newMeal,
            // Ensure all required fields
            mealType:
              data.newMeal.mealType ||
              prev.days[dayIndex].meals[mealIndex].mealType,
            ingredients: data.newMeal.ingredients || [],
            instructions: data.newMeal.instructions || [
              "Prepare",
              "Cook",
              "Serve",
            ],
            cookingTime: data.newMeal.cookingTime || 25,
            recipeSource: data.newMeal.recipeSource || "openai",
          };

          return {
            ...prev,
            days: updatedDays,
            swaps: data.swaps || prev.swaps,
            needsUpdate: prev.isSaved ? true : false,
          };
        });

        return data;
      } else {
        toast.error(data.error || "Failed to swap meal");
        return null;
      }
    } catch (error) {
      console.error("Swap error:", error);

      // Specific error messages
      if (error.message.includes("timeout")) {
        toast.error("Swap request timed out. Please try again.");
      } else if (error.message.includes("Free users")) {
        toast.error("Upgrade to swap meals");
      } else if (error.message.includes("No swaps")) {
        toast.error("No swaps remaining");
      } else {
        toast.error("Error swapping meal: " + error.message);
      }

      return null;
    } finally {
      // setIsSwapping(false);
      setSwappingMeals((prev) => ({ ...prev, [mealKey]: false }));
    }
  };

  return (
    <section className='py-16 md:py-20'>
      <div className='container mx-auto px-4 max-w-[1500px]'>
        <p className='text-center text-3xl md:text-4xl font-semibold text-gray-900 mb-3'>
          {t("title")}
        </p>
        {/* Error Message */}
        {error && (
          <div className='max-w-6xl mx-auto mb-8'>
            <div className='bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg'>
              {error}
            </div>
          </div>
        )}
        {/* for free users */}
        {freeLimitReached && (
          <div className='max-w-6xl mx-auto mb-6'>
            <div className='bg-yellow-50 border border-yellow-200 rounded-xl p-4'>
              <p className='text-yellow-800 font-medium'>
                You have reached your free plan limit (1 plan per month).
              </p>
              <p className='text-yellow-700 text-sm mt-1'>
                Upgrade to <span className='font-semibold'>Plus</span> for 6
                plans/month, or <span className='font-semibold'>Premium</span>{" "}
                for unlimited plans.
              </p>
              <button
                onClick={() => (window.location.href = "/#pricing")}
                className='mt-2 bg-[#8cc63c] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#7ab32f] transition'>
                View Plans & Pricing
              </button>
            </div>
          </div>
        )}
        {/* Form */}
        {!plan ? (
          <div className='max-w-6xl mx-auto'>
            <form
              onSubmit={handleSubmit}
              className='space-y-4 bg-white rounded-2xl shadow-lg p-6 md:p-6'>
              {/* Province & Goal */}
              <div className='grid md:grid-cols-2 gap-6'>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    {t(`form.province`)}
                  </label>

                  <div className='relative'>
                    <select
                      name='province'
                      value={form.province}
                      onChange={handleChange}
                      required
                      className='w-full appearance-none px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2'>
                      {PROVINCES.map((province) => (
                        <option key={province} value={province}>
                          {province}
                        </option>
                      ))}
                    </select>

                    <span className='pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400'>
                      <IoIosArrowDown />
                    </span>
                  </div>
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    {t(`form.goal`)}
                  </label>
                  <div className='relative'>
                    <select
                      name='goal'
                      value={form.goal}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Check if it's a premium goal
                        if (
                          value === "Family Friendly" &&
                          (!user || user?.tier === "free")
                        ) {
                          toast.error(
                            "Upgrade to Premium for Family Friendly plans",
                          );
                          return;
                        }
                        handleChange(e);
                      }}
                      required
                      className='w-full appearance-none px-4 py-3 border border-gray-300 rounded-lg focus:ring-2'>
                      <option value=''>{t(`form.selectGoal`)}</option>
                      {GOALS.map((goal) => {
                        const isPremiumGoal = goal === "Family Friendly";
                        const isRestricted =
                          isPremiumGoal && (!user || user?.tier === "free");

                        return (
                          <option
                            key={goal}
                            value={goal}
                            disabled={isRestricted}
                            className={
                              isRestricted ? "text-gray-400 bg-gray-50" : ""
                            }>
                            {goal} {isRestricted && "🔒"}
                          </option>
                        );
                      })}
                    </select>
                    <span className='pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400'>
                      <IoIosArrowDown />
                    </span>
                  </div>
                </div>
              </div>

              {/* Cuisine & Budget */}
              <div className='grid md:grid-cols-2 gap-6'>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    {t(`form.cuisine`)}
                  </label>
                  <input
                    type='text'
                    name='cuisine'
                    value={form.cuisine}
                    onChange={handleChange}
                    placeholder={t(`form.cuisinePlaceholder`)}
                    className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2'
                  />
                </div>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    {t(`form.budgetLevel`)}
                  </label>
                  <div className='relative'>
                    <select
                      name='budgetLevel'
                      value={form.budgetLevel}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (
                          value === "High" &&
                          (!user || user?.tier === "free")
                        ) {
                          toast.error(
                            "High budget is a Premium feature. Upgrade to access.",
                          );
                          return;
                        }
                        handleChange(e);
                      }}
                      className='w-full appearance-none px-4 py-3 border border-gray-300 rounded-lg focus:ring-2'>
                      {BUDGET_LEVELS.map((level) => {
                        const isPremium = level === "High";
                        const isDisabled =
                          isPremium && (!user || user?.tier === "free");

                        return (
                          <option
                            key={level}
                            value={level}
                            disabled={isDisabled}
                            className={isDisabled ? "text-gray-400" : ""}>
                            {level} {isDisabled && "🔒 Premium"}
                          </option>
                        );
                      })}
                    </select>
                    <span className='pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400'>
                      <IoIosArrowDown />
                    </span>
                  </div>
                </div>
              </div>

              {/* Portions, Meals, Time */}
              <div className='grid md:grid-cols-4 gap-6'>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    {t(`form.portions`)}
                  </label>
                  <input
                    type='number'
                    name='portions'
                    min='1'
                    max='10'
                    value={form.portions}
                    onChange={handleChange}
                    className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2'
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    {t(`form.mealsPerDay`)}
                  </label>
                  <input
                    type='number'
                    name='mealsPerDay'
                    min='1'
                    max='5'
                    value={form.mealsPerDay}
                    onChange={handleChange}
                    className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2'
                  />
                </div>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-1'>
                    Number of Days <span className='text-red-500'>*</span>
                  </label>
                  <div className='relative'>
                    <select
                      name='days_count'
                      value={form.days_count}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        // Prevent selecting disabled options
                        if (value > 3 && (!user || user?.tier === "free")) {
                          toast.error("Upgrade to Premium for 7-day plans");
                          return;
                        }
                        setForm({
                          ...form,
                          days_count: value,
                        });
                      }}
                      className='w-full appearance-none px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500'
                      disabled={loading}>
                      {/* Always available - 3 days */}
                      <option value='3'>3 days</option>

                      {/* 4-7 days: Show with premium icons for guest/free users */}
                      {[4, 5, 6, 7].map((days) => {
                        const isRestricted = !user || user?.tier === "free";

                        return (
                          <option
                            key={days}
                            value={days}
                            disabled={isRestricted}
                            className={
                              isRestricted ? "text-gray-400 bg-gray-50" : ""
                            }>
                            {days} days {isRestricted && "🔒 Premium"}
                          </option>
                        );
                      })}
                    </select>
                    <span className='pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400'>
                      <IoIosArrowDown />
                    </span>
                  </div>

                  {/* Help text with upgrade link */}
                  <div className='flex items-center justify-between mt-1'>
                    <p className='text-xs text-gray-500'>
                      {!user
                        ? "Login to access 7-day plans"
                        : user?.tier === "free"
                          ? "Free tier: 3-day limit"
                          : "Premium: Up to 7-day plans"}
                    </p>

                    {(!user || user?.tier === "free") && (
                      <button
                        type='button'
                        onClick={() => (window.location.href = "/#pricing")}
                        className='text-xs text-[#8cc63c] hover:text-[#7ab32f] font-medium'>
                        Upgrade →
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    {t(`form.maxCookingTime`)} (minutes)
                  </label>
                  <input
                    type='number'
                    name='maxCookingTime'
                    min='5'
                    max='180'
                    value={form.maxCookingTime}
                    onChange={handleChange}
                    className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2'
                  />
                </div>
              </div>

              {/* Likes & Dislikes */}
              <div className='grid md:grid-cols-2 gap-6'>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    {t(`form.likes`)}
                  </label>
                  <input
                    type='text'
                    name='likes'
                    value={form.likes}
                    onChange={handleChange}
                    placeholder={t(`form.likesPlaceholder`)}
                    className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2'
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    {t(`form.dislikes`)}
                  </label>
                  <input
                    type='text'
                    name='dislikes'
                    value={form.dislikes}
                    onChange={handleChange}
                    placeholder={t(`form.dislikesPlaceholder`)}
                    className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2'
                  />
                </div>
              </div>

              {/* Cooking Method & Skill Level */}
              <div className='grid md:grid-cols-2 gap-6'>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    {t(`form.cookingMethod`)}
                  </label>
                  <input
                    type='text'
                    name='cookingMethod'
                    value={form.cookingMethod}
                    onChange={handleChange}
                    placeholder='e.g., bake, grill, stir-fry'
                    className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2'
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    {t(`form.skillLevel`)}
                  </label>
                  <div className='relative'>
                    <select
                      name='skillLevel'
                      value={form.skillLevel}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (
                          value === "Advanced" &&
                          (!user || user?.tier === "free")
                        ) {
                          toast.error(
                            "Advanced skill level is a Premium feature.",
                          );
                          return;
                        }
                        handleChange(e);
                      }}
                      className='w-full appearance-none px-4 py-3 border border-gray-300 rounded-lg focus:ring-2'>
                      {SKILL_LEVELS.map((level) => {
                        const isPremium = level === "Advanced";
                        const isDisabled =
                          isPremium && (!user || user?.tier === "free");

                        return (
                          <option
                            key={level}
                            value={level}
                            disabled={isDisabled}
                            className={isDisabled ? "text-gray-400" : ""}>
                            {level} {isDisabled && "🔒 Premium"}
                          </option>
                        );
                      })}
                    </select>
                    <span className='pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400'>
                      <IoIosArrowDown />
                    </span>
                  </div>
                </div>
              </div>

              {/* Dietary Preferences */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-3'>
                  {t(`form.dietaryPreferences`)}
                  {(!user || user?.tier === "free") && (
                    <span className='text-xs text-gray-500 ml-2'>
                      (Premium options locked 🔒)
                    </span>
                  )}
                </label>
                <div className='grid grid-cols-2 md:grid-cols-4 gap-2'>
                  {DIETARY_PREFERENCES.map((pref) => {
                    const isPremium = [
                      "Keto",
                      "Paleo",
                      "Mediterranean",
                      "Halal",
                    ].includes(pref);
                    const isDisabled =
                      isPremium && (!user || user?.tier === "free");

                    return (
                      <label
                        key={pref}
                        className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${
                          isDisabled
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-gray-50 hover:bg-gray-100"
                        }`}>
                        <input
                          type='checkbox'
                          name='dietaryPreferences'
                          value={pref}
                          checked={form.dietaryPreferences.includes(pref)}
                          onChange={(e) => {
                            if (isDisabled) {
                              toast.error(
                                `"${pref}" is a Premium feature. Upgrade to access.`,
                              );
                              return;
                            }
                            handleChange(e);
                          }}
                          disabled={isDisabled}
                          className={`h-4 w-4 rounded ${
                            isDisabled
                              ? "cursor-not-allowed opacity-50"
                              : "text-blue-600"
                          }`}
                        />
                        <span
                          className={`text-sm ${
                            isDisabled ? "text-gray-400" : "text-gray-700"
                          }`}>
                          {pref} {isDisabled && "🔒"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Allergies */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-3'>
                  {t(`form.allergies`)}
                </label>
                <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
                  {ALLERGIES.map((allergy) => (
                    <label
                      key={allergy}
                      className='flex items-center space-x-2 bg-gray-50 px-3 py-2 rounded-lg hover:bg-gray-100'>
                      <input
                        type='checkbox'
                        name='allergies'
                        value={allergy}
                        checked={form.allergies.includes(allergy)}
                        onChange={handleChange}
                        className='h-4 w-4 text-blue-600 rounded'
                      />
                      <span className='text-sm text-gray-700'>{allergy}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <div className='pt-4'>
                <button
                  type='submit'
                  disabled={loading}
                  className='w-full bg-[#8cc63c] hover:bg-[#7ab32f] text-white font-semibold py-4 px-6 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 relative overflow-hidden'>
                  {loading ? (
                    <div className='flex items-center justify-center'>
                      <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2'></div>
                      Generating {form.days_count}-Day Plan... (
                      {generatingProgress}%)
                    </div>
                  ) : (
                    t("generateButton")
                  )}
                </button>

                {/* Estimated Time */}
                {loading && (
                  <p className='text-sm text-gray-500 text-center mt-2'>
                    Estimated time:{" "}
                    {form.days_count <= 3
                      ? "30-60 seconds"
                      : form.days_count <= 5
                        ? "1-2 minutes"
                        : "2-3 minutes"}
                  </p>
                )}
              </div>
            </form>
          </div>
        ) : (
          /* Plan Display */
          <div className='max-w-[1500px] mt-6 mx-auto'>
            <div className='bg-white rounded-2xl shadow-xl p-2 md:p-6'>
              {/* Plan Header */}
              <div className='flex flex-col md:flex-row md:items-center justify-between mb-8'>
                <div>
                  <h2 className='text-2xl md:text-3xl font-bold text-gray-900'>
                    {plan.title}
                  </h2>
                  <p className='text-gray-600 mt-2'>
                    {plan.days?.length || 7}-Day Plan •{t("plan.generatedFor")}{" "}
                    <span className='font-semibold text-[#8cc63c]'>
                      {plan.swaps.remaining} of {plan.swaps.allowed} swaps
                      available
                    </span>{" "}
                    •{" "}
                    {plan.tier === "free"
                      ? "Free Plan"
                      : `${
                          plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1)
                        } Tier`}
                  </p>
                </div>
                {/* <div
                  className="btn cursor-pointer text-[#8cc63c] hover:text-green-700 "
                  onClick={generateAnother}
                >
                  Generate Another Plan
                </div> */}
              </div>

              {/* Meal Plan Days */}
              <div className='space-y-6'>
                {plan.days?.map((day, dayIndex) => (
                  <div
                    key={dayIndex}
                    className='border border-gray-200 rounded-xl p-2 md:p-6 hover:border-blue-300 transition'>
                    <div className='flex items-center mb-6'>
                      <div className='bg-green-100 text-[#8cc63c] font-bold text-lg w-10 h-10 flex items-center justify-center rounded-full mr-4'>
                        {dayIndex + 1}
                      </div>
                      <h3 className='text-xl font-semibold text-gray-900'>
                        Day {dayIndex + 1}
                      </h3>
                    </div>

                    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3  gap-4'>
                      {day.meals?.map((meal, mealIndex) => (
                        <div
                          key={mealIndex}
                          className='bg-gray-50 rounded-xl md:p-3 p-2 hover:bg-white hover:shadow-md transition flex flex-col md:h-[400px] h-[280px]'>
                          {/* Header*/}
                          <div className='flex items-center justify-between mb-2'>
                            <div className='flex items-center min-w-0 flex-1'>
                              <span
                                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-sm font-semibold mr-2 shrink-0 ${
                                  meal.mealType === "breakfast"
                                    ? "bg-green-100 text-green-800"
                                    : meal.mealType === "lunch"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : meal.mealType === "dinner"
                                        ? "bg-red-100 text-red-800"
                                        : "bg-purple-100 text-purple-800"
                                }`}>
                                {meal.mealType.charAt(0).toUpperCase()}
                              </span>
                              <h4 className='text-sm font-semibold text-gray-900 flex-1'>
                                {meal.recipeName}
                              </h4>
                            </div>
                            <div className='text-sm  text-gray-500 shrink-0 ml-2'>
                              {meal.cookingTime} min
                            </div>
                          </div>
                          {meal.recipeSource === "spoonacular" && (
                            <span className='text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full flex items-center shrink-0 ml-2'>
                              <svg
                                className='w-3 h-3 mr-1'
                                fill='currentColor'
                                viewBox='0 0 20 20'>
                                <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
                              </svg>
                              Verified
                            </span>
                          )}

                          <div className='text-sm text-gray-500 shrink-0 ml-2'>
                            {meal.cookingTime} min
                          </div>
                          {/* Scrollable Content Area - Mobile optimized */}
                          <div className='flex-1 overflow-y-auto pr-1 meal-scroll'>
                            {/* Ingredients - Mobile friendly */}
                            <div className='mb-3'>
                              <p className='text-sm font-medium text-gray-700 mb-1'>
                                Ingredients ({meal.ingredients?.length || 0}):
                              </p>
                              <div className='flex flex-wrap gap-1'>
                                {meal.ingredients?.map((ing, idx) => (
                                  <span
                                    key={idx}
                                    className='bg-white border border-gray-200 px-2 py-1 rounded text-sm whitespace-normal wrap-break-words'
                                    title={`${ing.quantity} ${ing.unit} ${ing.name}`}>
                                    {ing.quantity} {ing.unit} {ing.name}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Instructions - Mobile optimized */}
                            {meal.instructions &&
                              meal.instructions.length > 0 && (
                                <div className='mb-2'>
                                  <p className='text-sm font-medium text-gray-700 mb-1'>
                                    Instructions:
                                  </p>
                                  <ol className='space-y-1'>
                                    {meal.instructions.map((step, idx) => (
                                      <li
                                        key={idx}
                                        className='text-sm text-gray-600 flex'>
                                        <span className='font-semibold text-[#4a9fd8] mr-1 shrink-0'>
                                          {idx + 1}.
                                        </span>
                                        <span className='flex-1'>{step}</span>
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              )}
                          </div>

                          {/* Swap Button */}
                          <div className='pt-2 border-t border-gray-100'>
                            <button
                              onClick={async () => {
                                const mealKey = `${dayIndex}-${mealIndex}`;
                                const isThisMealSwapping =
                                  swappingMeals[mealKey];

                                if (isThisMealSwapping) return; // Already swapping

                                if (!user) {
                                  toast.error("Please login to swap meals");
                                  return;
                                }

                                if (user.tier === "free") {
                                  toast.error(
                                    "Upgrade to Plus or Premium to swap meals",
                                  );
                                  return;
                                }

                                if (plan.swaps.remaining <= 0) {
                                  toast.error(
                                    `No swaps remaining! Used ${plan.swaps.used}/${plan.swaps.allowed}`,
                                  );
                                  return;
                                }

                                await swapMeal(plan.id, mealIndex, dayIndex);
                              }}
                              disabled={
                                swappingMeals[`${dayIndex}-${mealIndex}`]
                              }
                              className={`w-full text-sm font-medium py-2 rounded transition ${
                                swappingMeals[`${dayIndex}-${mealIndex}`]
                                  ? "bg-gray-300 cursor-not-allowed"
                                  : "bg-[#4a9fd8] hover:bg-[#3a8ec8] text-white"
                              }`}>
                              {swappingMeals[`${dayIndex}-${mealIndex}`]
                                ? "Swapping..."
                                : "Swap This Meal"}
                            </button>
                            <p className='text-gray-600 mt-2 text-sm'>
                              {plan.days?.length || 7}-Day Plan •{" "}
                              <span className='font-semibold'>
                                {user?.tier === "free" ? (
                                  <span className='text-gray-500 ml-1'>
                                    No swaps for free tier
                                  </span>
                                ) : (
                                  <span className='text-[#8cc63c] ml-1'>
                                    {plan.swaps.remaining} of{" "}
                                    {plan.swaps.allowed} swaps available
                                  </span>
                                )}
                              </span>
                              •{" "}
                              {plan.tier === "free"
                                ? "Free Plan"
                                : `${
                                    plan.tier.charAt(0).toUpperCase() +
                                    plan.tier.slice(1)
                                  } Tier`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className='max-w-5xl mx-auto pt-8 border-t border-gray-200'>
                {plan.isSaved && (
                  <div className='bg-green-50 border border-green-200 rounded-xl p-4 mb-6'>
                    <p className='text-green-800'>
                      This plan is saved to your account. You can now generate
                      grocery lists.
                    </p>
                  </div>
                )}
                <div className='flex flex-col md:flex-row gap-4'>
                  <button
                    onClick={savePlan}
                    // disabled={
                    //   !plan ||
                    //   !user ||
                    //   user?.tier === "free" ||
                    //   (plan.isSaved && !plan.needsUpdate)
                    // }
                    className={`px-6 py-3 rounded-lg font-semibold transition-all flex-1 ${
                      !plan ||
                      !user ||
                      // user?.tier === "free" ||
                      (plan.isSaved && !plan.needsUpdate)
                        ? "bg-gray-300 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700 text-white"
                    }`}>
                    {!plan
                      ? "Save Plan"
                      : !user
                        ? "Login to Save"
                        : plan.needsUpdate
                          ? "Update Plan"
                          : plan.isSaved
                            ? "Plan Saved"
                            : "Save Plan"}
                  </button>
                  <button
                    onClick={() => {
                      if (plan.requiresAccount) {
                        toast.warning(
                          "Please create an account to generate grocery list!",
                        );
                      } else {
                        generateGroceryList(plan.id);
                      }
                    }}
                    className='flex-1 bg-green-600  text-white font-semibold py-4 rounded-xl hover:bg-green-400 hover:text-black transition flex items-center justify-center'>
                    {loading ? (
                      <div className='flex items-center gap-2'>
                        <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin'></div>
                        Generating...
                      </div>
                    ) : (
                      "Generate Grocery List"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
