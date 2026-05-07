"use client";

import Navbar from "@/components/shared/Navbar";
import Footer from "@/components/shared/Footer";
import React, { useState, useEffect, useRef } from "react";
// import ToastProvider from "@/components/ToastProvider";
import { FaShoppingCart } from "react-icons/fa";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

export default function HomeLayout({ children }) {
  const CookieConsent = dynamic(() => import("@/components/CookieConsent"), {
    ssr: false,
  });

  const { user } = useSelector((state) => state.auth);
  const [cartData, setCartData] = useState({
    checkedCount: 0,
    listId: null,
    instacartLink: null,
  });
  const pathname = usePathname();
  const initialLoadRef = useRef(true);
  const hasRestoredCartRef = useRef(false);

  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      const timer = setTimeout(() => {
        try {
          const stored = localStorage.getItem("prepcart_cart");
          if (stored) {
            const data = JSON.parse(stored);
            const isFresh = Date.now() - data.timestamp < 10 * 60 * 1000;
            if (isFresh) {
              setCartData({
                checkedCount: data.checkedCount || 0,
                listId: data.listId,
                instacartLink: data.instacartLink,
              });
            } else {
              localStorage.removeItem("prepcart_cart");
            }
          }
        } catch (error) {
          console.error("Error loading cart data:", error);
          localStorage.removeItem("prepcart_cart");
        }
        hasRestoredCartRef.current = true;
      }, 0);
      return () => clearTimeout(timer);
    }
  }, []);

  // Update cart data when localStorage changes
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "prepcart_cart") {
        setTimeout(() => {
          try {
            if (e.newValue) {
              const data = JSON.parse(e.newValue);
              setCartData({
                checkedCount: data.checkedCount || 0,
                listId: data.listId,
                instacartLink: data.instacartLink,
              });
            } else {
              setCartData({
                checkedCount: 0,
                listId: null,
                instacartLink: null,
              });
            }
          } catch (error) {
            console.error("Error parsing cart data:", error);
          }
        }, 0);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Poll for same-tab updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (!hasRestoredCartRef.current) return;
      try {
        const stored = localStorage.getItem("prepcart_cart");
        if (stored) {
          const data = JSON.parse(stored);
          if (
            data.checkedCount !== cartData.checkedCount ||
            data.listId !== cartData.listId ||
            data.instacartLink !== cartData.instacartLink
          ) {
            setTimeout(() => {
              setCartData({
                checkedCount: data.checkedCount || 0,
                listId: data.listId,
                instacartLink: data.instacartLink,
              });
            }, 0);
          }
        } else if (cartData.checkedCount > 0 || cartData.listId) {
          setTimeout(() => {
            setCartData({ checkedCount: 0, listId: null, instacartLink: null });
          }, 0);
        }
      } catch (error) {
        // Silently handle errors
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [cartData]);

  const handleCartClick = async () => {
    if (!user) {
      toast.info("Please login to use Instacart integration");
      return;
    }

    if (!cartData.listId) {
      toast.info("Please open a grocery list first");
      return;
    }

    if (cartData.checkedCount === 0) {
      toast.info(
        "Please select at least one item to add to your Instacart cart",
      );
      return;
    }

    try {
      const token =
        localStorage.getItem("token") || localStorage.getItem("accessToken");
      const response = await fetch(`/api/groceryLists/${cartData.listId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) throw new Error(`Failed: ${response.status}`);

      const data = await response.json();
      const groceryList = data.groceryList;

      const checkedItems = groceryList.items
        .filter((item) => item.checked)
        .map((item) => ({
          name: item.name,
          quantity: item.quantity || 1,
          unit: item.unit || "unit",
          checked: true,
        }));

      if (checkedItems.length === 0) {
        toast.info("No items selected");
        return;
      }

      toast.loading("Creating Instacart shopping list...");

      const instacartResponse = await fetch("/api/instacart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groceryItems: checkedItems,
          userId: user?.id,
          groceryListId: cartData.listId,
          source: "floating_cart_button",
        }),
      });

      const instacartData = await instacartResponse.json();

      toast.dismiss();

      if (instacartData.success && instacartData.url) {
        toast.success("Opening Instacart...");
        setTimeout(() => {
          window.open(instacartData.url, "_blank", "noopener,noreferrer");
        }, 500);
      } else {
        toast.error("Failed: " + (instacartData.error || "No URL"));
      }
    } catch (error) {
      console.error("Error:", error);
      toast.dismiss();
      toast.error(`Error: ${error.message}`);
    }
  };

  const isCartEnabled = user && cartData.checkedCount > 0;

  return (
    <div className='relative min-h-screen'>
      <Navbar />
      <main className='min-h-screen'>
        {children}
        {/* <ToastProvider /> */}
        <CookieConsent />
      </main>
      <Footer />

      <div className='fixed bottom-6 right-6 z-50'>
        <button
          onClick={handleCartClick}
          className={`
            relative group w-14 h-14 flex items-center justify-center rounded-full
            shadow-lg hover:shadow-xl hover:scale-105 active:scale-95
            transition-all duration-300
            ${
              isCartEnabled
                ? "bg-linear-to-br from-[#8cc63c] to-[#7ab32f] shadow-green-500/30 hover:shadow-green-500/40 animate-bounce hover:animate-none cursor-pointer"
                : "bg-gray-400 shadow-gray-400/30 hover:shadow-gray-400/40 cursor-not-allowed"
            }
          `}
          disabled={!isCartEnabled}>
          <FaShoppingCart className='w-6 h-6 text-white' />

          {cartData.checkedCount > 0 && user && (
            <div className='absolute -top-2 -right-2 flex items-center justify-center w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full border-2 border-white'>
              {cartData.checkedCount}
            </div>
          )}

          <div className='absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none hidden md:block'>
            {!user
              ? "Please login"
              : !cartData.listId
                ? "Open grocery list"
                : cartData.checkedCount === 0
                  ? "Select items first"
                  : `Order ${cartData.checkedCount} items on Instacart`}
          </div>
        </button>
      </div>
    </div>
  );
}
