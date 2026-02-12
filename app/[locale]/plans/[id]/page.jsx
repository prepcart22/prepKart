"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  DollarSign,
  ChefHat,
  ShoppingCart,
  Printer,
  Share2,
  Bookmark,
  Utensils,
  Flame,
  Scale,
  Droplets,
  Wheat,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";

export default function PlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useSelector((state) => state.auth);
  const locale = params.locale;
  const planId = params.id;

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [groceryListId, setGroceryListId] = useState(null);
  const [activeDay, setActiveDay] = useState(0);
  const [expandedCards, setExpandedCards] = useState({});
  const [generatingGrocery, setGeneratingGrocery] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token =
          localStorage.getItem("token") || localStorage.getItem("accessToken");

        // Fetch plan
        const planResponse = await fetch(`/api/plans?id=${planId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!planResponse.ok) {
          console.error("Plan fetch failed:", planResponse.status);
          setLoading(false);
          return;
        }

        const planData = await planResponse.json();
        // console.log("Plan data:", planData);
        // console.log("Plan groceryListId:", planData.groceryListId);

        setPlan(planData);

        // Check if plan has groceryListId
        if (planData.groceryListId) {
          // console.log(
          //   "Setting groceryListId from plan:",
          //   planData.groceryListId,
          // );
          setGroceryListId(planData.groceryListId);
        } else {
          // console.log("No groceryListId in plan, trying to find...");
          // Try to find grocery list
          try {
            const groceryResponse = await fetch(
              `/api/groceryLists/find?planId=${planId}`,
              {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              },
            );

            if (groceryResponse.ok) {
              const groceryData = await groceryResponse.json();
              // console.log("Grocery list response:", groceryData);

              if (groceryData.groceryList) {
                // console.log("Found grocery list:", groceryData.groceryList._id);
                setGroceryListId(groceryData.groceryList._id);
              } else {
                // console.log("No grocery list found in response");
                setGroceryListId(null);
              }
            } else {
              // console.log("Grocery list fetch failed:", groceryResponse.status);
              setGroceryListId(null);
            }
          } catch (error) {
            // console.log("Error finding grocery list:", error);
            setGroceryListId(null);
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [planId]);

  // Toggle meal expansion
  const toggleCardExpansion = (mealKey) => {
    setExpandedCards((prev) => ({
      ...prev,
      [mealKey]: !prev[mealKey],
    }));
  };

  // Generate grocery list
  const generateGroceryList = async () => {
    try {
      if (!plan || !plan._id) {
        toast.error("No plan available to generate grocery list");
        return;
      }

      // Check if user is logged in
      if (!user) {
        toast.error("Please login to generate grocery lists");
        return;
      }

      setGeneratingGrocery(true);

      // Get authentication token
      const token =
        localStorage.getItem("token") ||
        localStorage.getItem("accessToken") ||
        (user?.token ? user.token : null);

      if (!token) {
        toast.error("Authentication token missing. Please login again.");
        return;
      }

      const response = await fetch("/api/groceryLists/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planId: plan._id,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Get the grocery list ID from the response
        const newGroceryListId =
          data.groceryList?._id ||
          data.groceryListId ||
          data.id ||
          data.groceryList?.id;

        if (newGroceryListId) {
          // Update state immediately
          setGroceryListId(newGroceryListId);

          // Also update the plan data in state to include groceryListId
          setPlan((prevPlan) => ({
            ...prevPlan,
            groceryListId: newGroceryListId,
          }));

          toast.success("Grocery list generated successfully!");

          // Optional: Auto-redirect to grocery list
          // router.push(`/${locale}/grocery-list/${newGroceryListId}`);
        } else {
          toast.error("Grocery list generated but ID not found in response");
          console.error("Response data:", data);
        }
      } else {
        toast.error(data.error || "Failed to generate grocery list");
      }
    } catch (error) {
      console.error("Error generating grocery list:", error);
      toast.error("Error generating grocery list: " + error.message);
    } finally {
      setGeneratingGrocery(false);
    }
  };
  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-[#8cc63c] mx-auto'></div>
          <p className='mt-4 text-gray-600'>Loading meal plan...</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <h2 className='text-2xl font-bold text-gray-900 mb-2'>
            Plan not found
          </h2>
          <button
            onClick={() => router.back()}
            className='text-[#8cc63c] hover:text-[#7ab32f] font-medium'>
            Go back
          </button>
        </div>
      </div>
    );
  }

  // Calculate nutrition totals
  const calculateNutrition = () => {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let mealCount = 0;

    plan.days?.forEach((day) => {
      day.meals?.forEach((meal) => {
        if (meal.nutrition) {
          totalCalories += meal.nutrition.calories || 0;
          totalProtein += meal.nutrition.protein_g || 0;
          totalCarbs += meal.nutrition.carbs_g || 0;
          totalFat += meal.nutrition.fat_g || 0;
          mealCount++;
        }
      });
    });

    return {
      totalCalories: Math.round(totalCalories),
      totalProtein: Math.round(totalProtein),
      totalCarbs: Math.round(totalCarbs),
      totalFat: Math.round(totalFat),
      mealCount,
    };
  };

  const nutrition = calculateNutrition();

  return (
    <div className='min-h-screen bg-gray-50 max-w-[1500px] mx-auto'>
      {/* Header */}
      <div className='bg-white border-b'>
        <div className=' px-4 sm:px-6 lg:px-8 py-6'>
          <div className='flex items-center justify-between mb-6'>
            <button
              onClick={() => router.back()}
              className='flex items-center gap-2 text-gray-600 hover:text-gray-900'>
              <ArrowLeft className='w-5 h-5' />
              Back
            </button>

            <div className='flex items-center gap-2'>
              <button className='p-2 hover:bg-gray-100 rounded-lg'>
                <Printer className='w-5 h-5 text-gray-600' />
              </button>
              <button className='p-2 hover:bg-gray-100 rounded-lg'>
                <Share2 className='w-5 h-5 text-gray-600' />
              </button>
              <button className='p-2 hover:bg-gray-100 rounded-lg'>
                <Bookmark className='w-5 h-5 text-gray-600' />
              </button>
            </div>
          </div>

          <div>
            <h1 className='text-3xl font-bold text-gray-900'>{plan.title}</h1>

            <div className='flex flex-wrap items-center gap-4 mt-4'>
              <div className='flex items-center gap-2 text-sm text-gray-600'>
                <Calendar className='w-4 h-4' />
                <span>{plan.days?.length || 0} days</span>
              </div>
              <div className='flex items-center gap-2 text-sm text-gray-600'>
                <Clock className='w-4 h-4' />
                <span>
                  Created: {new Date(plan.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className='flex items-center gap-2 text-sm text-gray-600'>
                <Users className='w-4 h-4' />
              </div>
              {plan.inputs?.budget_level && (
                <div className='flex items-center gap-2 text-sm text-gray-600'>
                  <DollarSign className='w-4 h-4' />
                  <span>{plan.inputs.budget_level} budget</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className=' mx-auto px-4 sm:px-6 lg:px-8 py-8'>
        {/* Quick Stats */}
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8'>
          <div className='bg-white rounded-xl p-6 shadow-sm'>
            <div className='flex items-center gap-3 mb-2'>
              <Flame className='w-5 h-5 text-orange-500' />
              <h3 className='font-medium text-gray-900'>Total Calories</h3>
            </div>
            <p className='text-2xl font-bold text-gray-900'>
              {nutrition.totalCalories}
            </p>
            <p className='text-sm text-gray-500'>
              across {nutrition.mealCount} meals
            </p>
          </div>

          <div className='bg-white rounded-xl p-6 shadow-sm'>
            <div className='flex items-center gap-3 mb-2'>
              <Scale className='w-5 h-5 text-blue-500' />
              <h3 className='font-medium text-gray-900'>Protein</h3>
            </div>
            <p className='text-2xl font-bold text-gray-900'>
              {nutrition.totalProtein}g
            </p>
            <p className='text-sm text-gray-500'>total protein</p>
          </div>

          <div className='bg-white rounded-xl p-6 shadow-sm'>
            <div className='flex items-center gap-3 mb-2'>
              <Wheat className='w-5 h-5 text-green-500' />
              <h3 className='font-medium text-gray-900'>Carbs</h3>
            </div>
            <p className='text-2xl font-bold text-gray-900'>
              {nutrition.totalCarbs}g
            </p>
            <p className='text-sm text-gray-500'>total carbohydrates</p>
          </div>

          <div className='bg-white rounded-xl p-6 shadow-sm'>
            <div className='flex items-center gap-3 mb-2'>
              <Droplets className='w-5 h-5 text-yellow-500' />
              <h3 className='font-medium text-gray-900'>Fat</h3>
            </div>
            <p className='text-2xl font-bold text-gray-900'>
              {nutrition.totalFat}g
            </p>
            <p className='text-sm text-gray-500'>total fat</p>
          </div>
        </div>

        {/* Plan Details Grid */}
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
          {/* Left Column - Days Navigation */}
          <div className='lg:col-span-1'>
            <div className='bg-white rounded-xl p-6 shadow-sm sticky top-8'>
              <h2 className='text-xl font-semibold text-gray-900 mb-4'>Days</h2>
              <div className='space-y-2'>
                {plan.days?.map((day, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveDay(index)}
                    className={`w-full text-left p-4 rounded-lg transition-colors ${
                      activeDay === index
                        ? "bg-[#8cc63c]/10 border border-[#8cc63c]"
                        : "hover:bg-gray-50 border border-gray-200"
                    }`}>
                    <div className='flex items-center justify-between'>
                      <div>
                        <h3 className='font-medium text-gray-900'>
                          Day {day.dayIndex || index + 1}
                        </h3>
                        <p className='text-sm text-gray-500 mt-1'>
                          {day.meals?.length || 0} meals
                        </p>
                      </div>
                      <ChefHat className='w-5 h-5 text-gray-400' />
                    </div>
                  </button>
                ))}
              </div>

              {/* Grocery List Button - Simple version */}
              <div className='mt-8 pt-6 border-t'>
                {groceryListId ? (
                  <Link
                    href={`/${locale}/grocery-list/${groceryListId}`}
                    className='block w-full text-center py-3 rounded-lg font-medium transition-colors bg-[#8cc63c] hover:bg-[#7ab32f] text-white'>
                    <div className='flex items-center justify-center gap-2'>
                      <ShoppingCart className='w-5 h-5' />
                      View Grocery List
                    </div>
                  </Link>
                ) : (
                  <button
                    onClick={generateGroceryList}
                    disabled={generatingGrocery}
                    className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                      generatingGrocery
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-[#8cc63c] hover:bg-[#7ab32f] text-white"
                    }`}>
                    <ShoppingCart className='w-5 h-5' />
                    {generatingGrocery ? (
                      <>
                        <span>Generating...</span>
                        <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-white'></div>
                      </>
                    ) : (
                      "Generate Grocery List"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Day Details */}
          <div className='lg:col-span-2'>
            {plan.days?.[activeDay] && (
              <div className='bg-white rounded-xl p-6 shadow-sm'>
                <div className='flex items-center justify-between mb-6'>
                  <h2 className='text-xl font-semibold text-gray-900'>
                    Day {plan.days[activeDay].dayIndex || activeDay + 1}
                  </h2>
                  <span className='text-sm text-gray-500'>
                    {plan.days[activeDay].meals?.length || 0} meals
                  </span>
                </div>

                <div className='space-y-4'>
                  {plan.days[activeDay].meals?.map((meal, mealIndex) => {
                    const mealKey = `day${activeDay}-meal${mealIndex}`;
                    const isExpanded = expandedCards[mealKey];

                    return (
                      <div
                        key={mealIndex}
                        className='border rounded-xl p-6 hover:shadow-md transition-shadow'>
                        {/* Meal Header with View More button */}
                        <div className='flex items-start justify-between mb-4'>
                          <div>
                            <span className='inline-block px-3 py-1 bg-green-50 text-green-700 uppercase rounded-full text-sm font-medium mb-2'>
                              {meal.mealType}
                            </span>
                            <h3 className='text-lg font-semibold text-gray-900'>
                              {meal.recipeName}
                            </h3>
                          </div>
                          <div className='text-right'>
                            <p className='text-sm text-gray-600'>
                              {meal.cookingTime} mins
                            </p>
                            {/* <p className="text-xs text-gray-500">
                              {meal.servings || 2} servings
                            </p> */}
                            <button
                              onClick={() => toggleCardExpansion(mealKey)}
                              className='mt-2 text-sm text-green-600 hover:text-[#7ab32f] flex items-center gap-1'>
                              {isExpanded ? "View Less" : "View More"}
                              {isExpanded ? (
                                <ChevronUp className='w-3 h-3' />
                              ) : (
                                <ChevronDown className='w-3 h-3' />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Card Content with Fixed Height */}
                        <div
                          className={`h-56 ${
                            isExpanded ? "overflow-y-auto" : "overflow-hidden"
                          }`}>
                          {meal.nutrition && (
                            <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4'>
                              <div className='flex items-center gap-2'>
                                <Flame className='w-4 h-4 text-orange-500' />
                                <div>
                                  <p className='text-xs text-gray-500'>
                                    Calories
                                  </p>
                                  <p className='font-medium text-gray-900'>
                                    {meal.nutrition.calories || 0}
                                  </p>
                                </div>
                              </div>
                              <div className='flex items-center gap-2'>
                                <Scale className='w-4 h-4 text-blue-500' />
                                <div>
                                  <p className='text-xs text-gray-500'>
                                    Protein
                                  </p>
                                  <p className='font-medium text-gray-900'>
                                    {meal.nutrition.protein_g || 0}g
                                  </p>
                                </div>
                              </div>
                              <div className='flex items-center gap-2'>
                                <Wheat className='w-4 h-4 text-green-500' />
                                <div>
                                  <p className='text-xs text-gray-500'>Carbs</p>
                                  <p className='font-medium text-gray-900'>
                                    {meal.nutrition.carbs_g || 0}g
                                  </p>
                                </div>
                              </div>
                              <div className='flex items-center gap-2'>
                                <Droplets className='w-4 h-4 text-yellow-500' />
                                <div>
                                  <p className='text-xs text-gray-500'>Fat</p>
                                  <p className='font-medium text-gray-900'>
                                    {meal.nutrition.fat_g || 0}g
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Ingredients */}
                          {meal.ingredients && meal.ingredients.length > 0 && (
                            <div className='mb-3'>
                              <h4 className='text-sm font-medium text-gray-700 mb-2'>
                                Ingredients
                              </h4>
                              <div className='space-y-1'>
                                {meal.ingredients
                                  .slice(
                                    0,
                                    isExpanded ? meal.ingredients.length : 3,
                                  )
                                  .map((ingredient, idx) => (
                                    <div
                                      key={idx}
                                      className='flex items-start gap-2'>
                                      <span className='w-1.5 h-1.5 mt-1.5 bg-gray-300 rounded-full shrink-0'></span>
                                      <p className='text-sm text-gray-600'>
                                        <span className='font-medium'>
                                          {ingredient.name}
                                        </span>
                                        {ingredient.quantity &&
                                          ` - ${ingredient.quantity} ${ingredient.unit}`}
                                      </p>
                                    </div>
                                  ))}
                                {!isExpanded && meal.ingredients.length > 3 && (
                                  <p className='text-xs text-gray-500 pl-3'>
                                    +{meal.ingredients.length - 3} more
                                    ingredients
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Instructions */}
                          {meal.instructions &&
                            meal.instructions.length > 0 && (
                              <div>
                                <h4 className='text-sm font-medium text-gray-700 mb-2'>
                                  Instructions
                                </h4>
                                <div className='space-y-2'>
                                  {meal.instructions
                                    .slice(
                                      0,
                                      isExpanded ? meal.instructions.length : 1,
                                    )
                                    .map((step, idx) => (
                                      <div key={idx} className='flex gap-2'>
                                        <span className='w-5 h-5 shrink-0 bg-gray-100 text-gray-600 rounded text-xs flex items-center justify-center'>
                                          {idx + 1}
                                        </span>
                                        <p className='text-sm text-gray-600'>
                                          {step}
                                        </p>
                                      </div>
                                    ))}
                                  {!isExpanded &&
                                    meal.instructions.length > 1 && (
                                      <p className='text-xs text-gray-500 pl-7'>
                                        +{meal.instructions.length - 1} more
                                        steps
                                      </p>
                                    )}
                                </div>
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
