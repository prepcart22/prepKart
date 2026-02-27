"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  ShoppingCart,
  FileText,
  Bell,
  Menu,
  ChevronLeft,
  Home,
  LogOut,
} from "lucide-react";
import Link from "next/link";
// import ToastProvider from "@/components/ToastProvider";

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Handle responsive behavior
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    window.location.href = `/${locale}/login`;
  };

  const menuItems = [
    {
      icon: LayoutDashboard,
      label: "Dashboard",
      href: `/${locale}/admin`,
      active: pathname === `/${locale}/admin`,
    },
    {
      icon: FileText,
      label: "Blog Posts",
      href: `/${locale}/admin/blog`,
      active: pathname.includes("/admin/blog"),
    },
    {
      icon: Users,
      label: "Users",
      href: `/${locale}/admin/users`,
      active: pathname.includes("/admin/users"),
    },
    {
      icon: CreditCard,
      label: "Newsletter Subscribers",
      href: `/${locale}/admin/subscriptions`,
      active: pathname.includes("/admin/subscriptions"),
    },
    {
      icon: ShoppingCart,
      label: "Instacart Analytics",
      href: `/${locale}/admin/instacart`,
      active: pathname.includes("/admin/instacart"),
    },
  ];

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen transition-all duration-300 bg-white border-r border-gray-200 ${
          sidebarOpen ? "w-64" : "w-0 md:w-16"
        } overflow-hidden`}>
        <div className='h-full flex flex-col'>
          {/* Logo */}
          <div
            className={`flex items-center p-4 border-b border-gray-200 ${sidebarOpen ? "justify-between" : "justify-center"}`}>
            {sidebarOpen && (
              <h1 className='text-2xl font-bold text-green-600'>Prepcart</h1>
            )}
            {!sidebarOpen && !isMobile && (
              <div className='w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold'>
                P
              </div>
            )}
          </div>

          {/* Menu Items */}
          <nav className='flex-1 p-3 overflow-y-auto'>
            <ul className='space-y-2'>
              {menuItems.map((item, index) => (
                <li key={index}>
                  <Link
                    href={item.href}
                    className={`flex items-center p-3 rounded-lg transition-colors ${
                      item.active
                        ? "bg-green-50 text-green-700"
                        : "text-gray-700 hover:bg-gray-100"
                    } ${!sidebarOpen && !isMobile ? "justify-center" : ""}`}
                    title={!sidebarOpen ? item.label : ""}>
                    <item.icon className='w-5 h-5 shrink-0' />
                    {sidebarOpen && (
                      <span className='font-medium ml-3'>{item.label}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Bottom Actions */}
          <div className='p-3 border-t border-gray-200 space-y-2'>
            <Link
              href={`/${locale}`}
              className={`flex items-center p-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors ${!sidebarOpen && !isMobile ? "justify-center" : ""}`}
              title={!sidebarOpen ? "Back to Home" : ""}>
              <Home className='w-5 h-5 shrink-0' />
              {sidebarOpen && <span className='ml-3'>Back to Home</span>}
            </Link>
            <button
              onClick={handleLogout}
              className={`flex items-center p-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors w-full ${!sidebarOpen && !isMobile ? "justify-center" : ""}`}
              title={!sidebarOpen ? "Logout" : ""}>
              <LogOut className='w-5 h-5 shrink-0' />
              {sidebarOpen && <span className='ml-3'>Logout</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && isMobile && (
        <div
          className='fixed inset-0 z-30 bg-black/60 backdrop-blur-md'
          onClick={() => setSidebarOpen(false)}></div>
      )}

      {/* Main Content */}
      <div
        className={`transition-all duration-300 ${
          sidebarOpen ? "md:ml-64" : "md:ml-16"
        }`}>
        {/* Top Navigation */}
        <nav className='bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-20'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center flex-1'>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className='text-gray-500 hover:text-gray-700 mr-4 p-2 hover:bg-gray-100 rounded-lg transition-colors'>
                {sidebarOpen ? (
                  <ChevronLeft className='w-6 h-6' />
                ) : (
                  <Menu className='w-6 h-6' />
                )}
              </button>
            </div>

            {/* Right side - Notification & User */}
            <div className='flex items-center gap-4 ml-4'>
              <button className='relative text-gray-600 hover:text-gray-800'>
                <Bell className='w-6 h-6' />
                <span className='absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full'></span>
              </button>

              <div className='flex items-center gap-3'>
                <div className='w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-semibold'>
                  AD
                </div>
                <div className='hidden sm:block text-right'>
                  <div className='text-sm font-semibold text-gray-800'>
                    Admin User
                  </div>
                  <div className='text-xs text-gray-500'>admin@gmail.com</div>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Page Content */}
        <main className='p-4 sm:p-6'>{children}</main>
        {/* <ToastProvider /> */}
      </div>
    </div>
  );
}
