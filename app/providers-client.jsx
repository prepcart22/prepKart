"use client";

import { NextIntlClientProvider } from "next-intl";
import { Provider as ReduxProvider } from "react-redux";
import { useEffect } from "react";
import { store } from "@/store/store";
import { useDispatch } from "react-redux";
import { getCurrentUser, restoreAuthState } from "@/store/slices/authSlice";
import ToastProvider from "@/components/ToastProvider";

function AuthLoader() {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(restoreAuthState());
    const token = localStorage.getItem("token");
    if (token) {
      dispatch(getCurrentUser());
    }
  }, [dispatch]);

  return null;
}

export default function ProvidersClient({ locale, messages, children }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ReduxProvider store={store}>
        <AuthLoader />
        {children}
        <ToastProvider />
      </ReduxProvider>
    </NextIntlClientProvider>
  );
}