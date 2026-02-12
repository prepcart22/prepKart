"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FiX,
  FiLoader,
  FiCheck,
  FiArrowRight,
  FiRefreshCw,
} from "react-icons/fi";
import { useSelector } from "react-redux";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { toast } from "react-toastify";

export default function QuickPlanModal({ isOpen, onClose, planType, locale }) {
  const { user } = useSelector((state) => state.auth);
  const t = useTranslations("quickPlanModal");
  const modalRef = useRef(null);

  const [isLoading, setIsLoading] = useState(false);
  const [planData, setPlanData] = useState(null);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("3day"); // "3day" or "7day"
  const [isSwapping, setIsSwapping] = useState(false);

  const userTier = user?.tier || "free";

  // Generate initial 3-day plan
  useEffect(() => {
    if (isOpen && planType) {
      setViewMode("3day");
      generatePlan(3);
    }
  }, [isOpen, planType]);

  const generatePlan = async (daysCount) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/generate-quick-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planType,
          userTier,
          locale,
          daysCount,
          userId: user?.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Check if it's a monthly limit error
        if (data.error === "Monthly limit reached") {
          toast.error(data.message);
          onClose(); // Close the modal
          return;
        }
        throw new Error(data.error || "Failed");
      }

      // Add necessary structure for display
      const enrichedData = {
        ...data,
        days: data.days || [],
        title: `${
          planType.charAt(0).toUpperCase() + planType.slice(1)
        } ${daysCount}-Day Plan`,
        swaps: {
          allowed: userTier === "tier3" ? 3 : userTier === "tier2" ? 2 : 0,
          used: 0,
          remaining: userTier === "tier3" ? 3 : userTier === "tier2" ? 2 : 0,
        },
        tier: userTier,
        source: data._tier === "free" ? "openai" : "spoonacular",
      };

      setPlanData(enrichedData);
      if (daysCount === 7) setViewMode("7day");
      if (daysCount === 5) setViewMode("5day");
    } catch (err) {
      console.error("Error:", err);
      setError(`Error: ${err.message}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };
  const handleGet7DayPlan = () => {
    setViewMode("7day");
    generatePlan(7);
  };
  const handleGet5DayPlan = () => {
    setViewMode("5day");
    generatePlan(5);
  };

  const handleSavePlan = async () => {
    try {
      // console.log("=== DEBUG SAVE PLAN ===");
      // console.log("Redux user tier:", user?.tier);
      // console.log("Redux user object:", user);

      if (!planData || !user) {
        toast.warning("Please login to save plans!");
        return;
      }

      // Get the token
      const token =
        user.token ||
        localStorage.getItem("token") ||
        localStorage.getItem("auth_token");

      const requestBody = {
        planData: {
          ...planData,
          title:
            planData.title ||
            `${planType} ${viewMode === "7day" ? "7-Day" : "3-Day"} Plan`,
          days: planData.days || [],
          inputs: planData.userPreferences || {},
          swaps: planData.swaps || {
            allowed: user.tier === "tier3" ? 3 : user.tier === "tier2" ? 1 : 0,
            used: 0,
            remaining:
              user.tier === "tier3" ? 3 : user.tier === "tier2" ? 1 : 0,
          },
          tier: user.tier,
          source: planData.source || "openai",
          userId: user.id || user._id,
          userEmail: user.email,
          planType: planType,
        },
        userId: user.id || user._id,
        userEmail: user.email,
        userTier: user.tier,
        source: planData.source || "openai",
      };

      const response = await fetch("/api/quickPlans/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success("Plan saved successfully!");
        setPlanData((prev) => ({
          ...prev,
          id: result.plan?._id || result.plan?.id,
          isSaved: true,
          needsUpdate: false,
        }));

        // UPDATE MONTHLY STATS HERE (add this)
        if (result.monthlyStats) {
          setMonthlyStats(result.monthlyStats);
        }
      } else {
        toast.error(result.error || result.message || "Failed to save plan");
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Error saving plan: " + error.message);
    }
  };
  const handleGenerateGroceryList = async () => {
    try {
      if (!planData || !user) {
        toast.warning("Please login to generate grocery list!");
        return;
      }

      // if (user.tier === "free") {
      //   toast.error("Upgrade to Plus or Premium for grocery lists");
      //   window.location.href = "/#pricing";
      //   return;
      // }

      if (!planData.isSaved) {
        toast.warning(
          <div>
            <p className='font-medium'>Please save the plan first!</p>
            <p className='text-sm mt-1'>
              Click Save Plan to save your meal plan, then generate grocery
              list.
            </p>
          </div>,
          {
            autoClose: 5000,
            closeButton: true,
            closeOnClick: true,
          },
        );
        return;
      }

      setIsLoading(true);
      const requestBody = {
        planId: planData.id,
        planData: planData,
        pantryToggle: false,
      };

      const response = await fetch("/api/groceryLists/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${
            localStorage.getItem("token") || user.token
          }`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success("Grocery list generated successfully!");
        localStorage.setItem(
          "lastGroceryList",
          JSON.stringify(data.groceryList),
        );
        window.location.href = `/${locale}/grocery-list/${data.groceryList.id}`;
      } else {
        toast.error(data.error || "Failed to generate grocery list");
      }
    } catch (error) {
      console.error("Grocery list error:", error);
      toast.error("Error generating grocery list");
    } finally {
      setIsLoading(false);
    }
  };
  const [monthlyStats, setMonthlyStats] = useState({
    limit: userTier === "free" ? 1 : userTier === "tier2" ? 10 : 25,
    used: user?.monthly_plan_count || 0,
    remaining: 0,
  });

  // Calculate remaining plans
  useEffect(() => {
    if (user) {
      const limit = userTier === "free" ? 1 : userTier === "tier2" ? 10 : 25;
      const used = user.monthly_plan_count || 0;
      const remaining = Math.max(0, limit - used);

      // console.log("Monthly stats calculated:", {
      //   limit,
      //   used,
      //   remaining,
      //   userTier,
      // });

      setMonthlyStats({ limit, used, remaining });
    }
  }, [user, userTier]);

  const swapMeal = async (dayIndex, mealIndex) => {
    try {
      setIsSwapping(true);

      if (!user) {
        toast.error("Please login to swap meals");
        return;
      }

      if (planData.swaps.remaining <= 0) {
        toast.error("No swaps remaining!");
        return;
      }

      if (!planData.id) {
        toast.warning("Please save the plan first to enable swaps!");
        return;
      }

      // Get the token
      const token =
        user.token ||
        localStorage.getItem("token") ||
        localStorage.getItem("auth_token");

      const response = await fetch("/api/quickPlans/swap-meal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // Add this line
        },
        body: JSON.stringify({
          planId: planData.id,
          dayIndex,
          mealIndex,
          planType,
          userTier: user.tier,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success("Meal swapped successfully!");
        setPlanData((prev) => ({
          ...prev,
          days: prev.days.map((day, dIndex) =>
            dIndex === dayIndex
              ? {
                  ...day,
                  meals: day.meals.map((meal, mIndex) =>
                    mIndex === mealIndex ? data.newMeal : meal,
                  ),
                }
              : day,
          ),
          swaps: {
            ...prev.swaps,
            used: data.swaps?.used || prev.swaps.used + 1,
            remaining:
              data.swaps?.remaining || Math.max(0, prev.swaps.remaining - 1),
          },
          needsUpdate: true,
        }));
      } else {
        toast.error(data.error || data.message || "Failed to swap meal");
      }
    } catch (error) {
      console.error("Swap error:", error);
      toast.error("Error swapping meal");
    } finally {
      setIsSwapping(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4'>
      <div className='bg-white rounded-2xl max-w-[1400px] w-full max-h-[95vh] overflow-auto'>
        {/* Header */}
        <div className='sticky top-0 bg-white border-b p-4 sm:p-6 flex justify-between items-center'>
          <div>
            <h2 className='text-xl sm:text-2xl font-bold text-gray-900'>
              {viewMode === "3day"
                ? "Quick Preview"
                : viewMode === "5day"
                  ? "5-Day Plan"
                  : "7-Day Plan"}
            </h2>
            <p className='text-gray-600 mt-1 text-sm sm:text-base'>
              {viewMode === "3day"
                ? "3-day preview"
                : viewMode === "5day"
                  ? "Complete 5-day plan"
                  : "Complete weekly plan"}
              {planData && (
                <span className='ml-1 sm:ml-2 text-xs sm:text-sm font-medium'>
                  • {planData.swaps.remaining}/{planData.swaps.allowed} swaps
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className='p-2 hover:bg-gray-100 rounded-lg'>
            <FiX className='w-6 h-6' />
          </button>
        </div>
        <div className='mb-4 px-5 py-2 text-sm text-gray-600'>
          <p className=''>
            Monthly Plans: {monthlyStats.limit} •
            {/* {monthlyStats.remaining > 0
              ? ` ${monthlyStats.remaining} remaining`
              : " Limit reached"} */}
          </p>
          {monthlyStats.remaining <= 0 && userTier !== "tier3" && (
            <p className='text-red-600 text-xs mt-1'>
              {userTier === "free"
                ? "Upgrade to Plus for 10 plans/month or Premium for 25 plans/month"
                : "Upgrade to Premium for 25 plans/month"}
            </p>
          )}
        </div>
        <div className='p-3 sm:p-4 md:p-6'>
          {isLoading && (
            <div className='flex flex-col items-center justify-center py-12'>
              <FiLoader className='w-12 h-12 text-primary animate-spin mb-4' />
              <p className='text-gray-600'>
                {viewMode === "7day"
                  ? "Generating 7-Day Plan..."
                  : "Generating preview..."}
              </p>
            </div>
          )}

          {error && !isLoading && (
            <div className='bg-red-50 border border-red-200 rounded-xl p-6 mb-6'>
              <h4 className='font-semibold text-red-900 mb-2'>Error</h4>
              <p className='text-red-700 mb-2'>{error}</p>
              <button
                onClick={() => generatePlan(viewMode === "7day" ? 7 : 3)}
                className='bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700'>
                Try Again
              </button>
            </div>
          )}

          {!isLoading && !error && planData && (
            <div>
              {viewMode === "3day" ? (
                // 3-DAY PREVIEW
                <div className='mb-8'>
                  <h3 className='text-lg font-semibold mb-4'>
                    {t("yourQuickPlan")}
                  </h3>

                  {planData.days && planData.days.length > 0 ? (
                    planData.days.slice(0, 1).map((day) => (
                      <div key={day.dayIndex} className='space-y-4'>
                        <h4 className='font-medium text-gray-900'>
                          {day.dayName}
                        </h4>
                        {day.meals && day.meals.length > 0 ? (
                          day.meals.slice(0, 3).map((meal, idx) => (
                            <div
                              key={idx}
                              className='border rounded-lg p-3 sm:p-2'>
                              <div className='flex justify-between items-start gap-2'>
                                <div className='flex-1 min-w-0'>
                                  <p className='font-medium text-sm sm:text-base'>
                                    {meal.recipeName || "Unnamed Recipe"}
                                  </p>
                                  <p className='text-xs sm:text-sm text-gray-600 capitalize'>
                                    {meal.mealType || "meal"}
                                  </p>
                                </div>
                                <span className='text-xs sm:text-sm text-gray-500 whitespace-nowrap'>
                                  {meal.cookingTime || 25} min
                                </span>
                              </div>
                              {meal.ingredients &&
                                meal.ingredients.length > 0 && (
                                  <p className='text-xs sm:text-sm text-gray-500 mt-1 '>
                                    {meal.ingredients[0].name}:{" "}
                                    {meal.ingredients[0].quantity}{" "}
                                    {meal.ingredients[0].unit}
                                  </p>
                                )}
                            </div>
                          ))
                        ) : (
                          <p className='text-gray-500'>No meals generated</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className='bg-yellow-50 border border-yellow-200 rounded-lg p-4'>
                      <p className='text-yellow-800'>
                        Plan generation returned empty data
                      </p>
                      <button
                        onClick={() => generatePlan(3)}
                        className='mt-2 text-sm text-yellow-700 hover:text-yellow-900'>
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                // 7-DAY FULL PLAN (Same as GenerateWeeklyPlan)
                <div>
                  {/* Plan Header */}
                  <div className='flex flex-col md:flex-row md:items-center justify-between mb-4 sm:mb-6 md:mb-8'>
                    <div>
                      <h2 className='text-xl sm:text-2xl md:text-3xl font-bold text-gray-900'>
                        {planData.title ||
                          `${planType} ${planData.days?.length || 7}-Day Plan`}
                      </h2>
                      <p className='text-gray-600 mt-1 sm:mt-2 text-xs sm:text-sm'>
                        {planData.days?.length || 7}-Day Plan •{" "}
                        <span className='font-semibold text-green-600'>
                          {planData.swaps.remaining}/{planData.swaps.allowed}{" "}
                          swaps
                        </span>{" "}
                        •{" "}
                        {planData.tier === "free"
                          ? "Free Plan"
                          : `${
                              planData.tier.charAt(0).toUpperCase() +
                              planData.tier.slice(1)
                            } Tier`}
                      </p>
                    </div>
                  </div>

                  {/* Meal Plan Days */}
                  <div className='space-y-6 max-h-[500px] overflow-y-auto pr-2'>
                    {planData.days?.map((day, dayIndex) => (
                      <div
                        key={dayIndex}
                        className='border border-gray-200 rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 hover:border-blue-300 transition mb-4 sm:mb-6'>
                        <div className='flex items-center mb-4 sm:mb-6'>
                          <div className='bg-green-100 text-green-700 font-bold text-base sm:text-lg w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full mr-3 sm:mr-4 flex-shrink-0'>
                            {dayIndex + 1}
                          </div>
                          <h3 className='text-lg sm:text-xl font-semibold text-gray-900'>
                            Day {dayIndex + 1} • {day.dayName}
                          </h3>
                        </div>

                        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
                          {day.meals?.map((meal, mealIndex) => (
                            <div
                              key={mealIndex}
                              className='bg-gray-50 rounded-xl p-4 hover:bg-white hover:shadow-md transition flex flex-col h-[400px]'>
                              {/* Meal Header */}
                              <div className='flex items-center justify-between mb-3'>
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
                                  <h4 className='text-sm font-semibold text-gray-900  flex-1'>
                                    {meal.recipeName}
                                  </h4>
                                </div>
                                <div className='text-sm text-gray-500 shrink-0 ml-2'>
                                  {meal.cookingTime} min
                                </div>
                              </div>

                              {/* Verified Badge */}
                              {meal.recipeSource === "spoonacular" && (
                                <span className='text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full flex items-center w-fit mb-3'>
                                  <svg
                                    className='w-3 h-3 mr-1'
                                    fill='currentColor'
                                    viewBox='0 0 20 20'>
                                    <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
                                  </svg>
                                  Verified
                                </span>
                              )}

                              {/* Scrollable Content */}
                              <div className='flex-1 overflow-y-auto pr-1 mb-3'>
                                {/* Ingredients */}
                                <div className='mb-3'>
                                  <p className='text-sm font-medium text-gray-700 mb-1'>
                                    Ingredients ({meal.ingredients?.length || 0}
                                    ):
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

                                {/* Instructions */}
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
                                            <span className='font-semibold text-blue-600 mr-1 shrink-0'>
                                              {idx + 1}.
                                            </span>
                                            <span className='flex-1'>
                                              {step}
                                            </span>
                                          </li>
                                        ))}
                                      </ol>
                                    </div>
                                  )}

                                {/* Nutrition Info for paid tiers */}
                                {meal.nutrition && userTier !== "free" && (
                                  <div className='mt-3 pt-3 border-t border-gray-200'>
                                    <p className='text-sm font-medium text-gray-700 mb-1'>
                                      Nutrition (estimated):
                                    </p>
                                    <div className='grid grid-cols-4 gap-2 text-xs'>
                                      <div className='bg-blue-50 p-2 rounded'>
                                        <p className='font-medium text-blue-700'>
                                          {meal.nutrition.calories}
                                        </p>
                                        <p className='text-blue-600'>cal</p>
                                      </div>
                                      <div className='bg-green-50 p-2 rounded'>
                                        <p className='font-medium text-green-700'>
                                          {meal.nutrition.protein_g}g
                                        </p>
                                        <p className='text-green-600'>
                                          protein
                                        </p>
                                      </div>
                                      <div className='bg-yellow-50 p-2 rounded'>
                                        <p className='font-medium text-yellow-700'>
                                          {meal.nutrition.carbs_g}g
                                        </p>
                                        <p className='text-yellow-600'>carbs</p>
                                      </div>
                                      <div className='bg-red-50 p-2 rounded'>
                                        <p className='font-medium text-red-700'>
                                          {meal.nutrition.fat_g}g
                                        </p>
                                        <p className='text-red-600'>fat</p>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Swap Button */}
                              {userTier !== "free" &&
                                planData.swaps.remaining > 0 && (
                                  <div className='pt-3 border-t border-gray-200'>
                                    <button
                                      onClick={() =>
                                        swapMeal(dayIndex, mealIndex)
                                      }
                                      disabled={isSwapping}
                                      className={`w-full text-sm font-medium py-2 rounded transition ${
                                        isSwapping
                                          ? "bg-gray-300 cursor-not-allowed"
                                          : "bg-blue-600 hover:bg-blue-700 text-white"
                                      }`}>
                                      {isSwapping
                                        ? "Swapping..."
                                        : "Swap This Meal"}
                                    </button>
                                  </div>
                                )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Action Buttons for 7-day plan */}
                  <div className='mt-8 pt-6 border-t border-gray-200'>
                    {planData.isSaved && (
                      <div className='bg-green-50 border border-green-200 rounded-xl p-4 mb-6'>
                        <p className='text-green-800'>
                          This plan is saved to your account. You can now
                          generate grocery lists.
                        </p>
                      </div>
                    )}

                    <div className='flex flex-col md:flex-row gap-4'>
                      <button
                        onClick={handleSavePlan}
                        disabled={
                          !planData ||
                          !user ||
                          (planData.isSaved && !planData.needsUpdate)
                        }
                        className={`px-6 py-3 rounded-lg font-semibold transition-all flex-1 ${
                          !planData ||
                          !user ||
                          (planData.isSaved && !planData.needsUpdate)
                            ? "bg-gray-300 cursor-not-allowed"
                            : "bg-green-600 hover:bg-green-700 text-white"
                        }`}>
                        {!planData
                          ? "Save Plan"
                          : !user
                            ? "Login to Save"
                            : planData.needsUpdate
                              ? "Update Plan"
                              : planData.isSaved
                                ? "Plan Saved"
                                : "Save Plan"}
                      </button>

                      <button
                        onClick={handleGenerateGroceryList}
                        disabled={isLoading || !planData.isSaved}
                        className={`flex-1 bg-green-600 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center ${
                          isLoading || !planData.isSaved
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:bg-green-700"
                        }`}>
                        {isLoading ? "Generating..." : "Generate Grocery List"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ACTION BUTTONS for 3-day view */}
              {viewMode === "3day" && (
                <div className='flex flex-col md:flex-row items-center justify-between bg-gray-50 rounded-xl p-6'>
                  <div className='flex flex-col'>
                    <h4 className='font-semibold text-gray-900 mb-2'>
                      {t("fullPlanTitle")}
                    </h4>
                    <p className='text-gray-600 mb-4'>
                      {t("fullPlanDescription")}
                    </p>
                  </div>
                  <div className='flex justify-end gap-2'>
                    <button
                      onClick={handleGet5DayPlan}
                      className='cursor-pointer bg-[#4a9fd8] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#3b8ec4] flex items-center gap-2'>
                      Get 5-Day Plan
                      <FiCheck className='w-4 h-4' />
                    </button>
                    <button
                      onClick={handleGet7DayPlan}
                      className='cursor-pointer bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 flex items-center gap-2'>
                      Get 7-Day Plan
                      <FiCheck className='w-4 h-4' />
                    </button>
                  </div>
                </div>
              )}

              {/* UPGRADE PROMPT */}
              {userTier === "free" && viewMode === "3day" && (
                <div className='mt-4 flex justify-between bg-blue-50 border border-blue-200 rounded-xl p-3'>
                  <div className='flex flex-col'>
                    <h4 className='font-semibold text-blue-900 mb-2'>
                      Free Plan Limit: 1 Plan/Month
                    </h4>
                    <p className='text-blue-800 mb-2'>
                      You have generated {monthlyStats.limit} plans this month.
                    </p>
                    <p className='text-blue-800 mb-4'>
                      Upgrade to Plus (6 plans/month) or Premium (unlimited) for
                      more!
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
