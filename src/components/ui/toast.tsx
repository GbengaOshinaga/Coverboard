"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "warning" | "info";

type ToastLink = { href: string; label: string };

type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
  link?: ToastLink;
};

type ToastContextType = {
  toast: (message: string, variant?: ToastVariant, link?: ToastLink) => void;
};

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const icons: Record<ToastVariant, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles: Record<ToastVariant, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
};

const iconStyles: Record<ToastVariant, string> = {
  success: "text-emerald-500",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant = "success", link?: ToastLink) => {
    const id = `toast-${++toastCounter}`;
    setToasts((prev) => [...prev, { id, message, variant, link }]);

    // A toast with a link stays longer so there's time to follow it.
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, link ? 8000 : 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}

      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none sm:bottom-6 sm:right-6">
        {toasts.map((t) => {
          const Icon = icons[t.variant];
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex items-start gap-2.5 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-200",
                styles[t.variant]
              )}
              role="alert"
            >
              <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", iconStyles[t.variant])} />
              <p className="flex-1 text-sm font-medium">
                {t.message}
                {t.link && (
                  <>
                    {" "}
                    <Link href={t.link.href} onClick={() => removeToast(t.id)} className="underline underline-offset-2">
                      {t.link.label}
                    </Link>
                  </>
                )}
              </p>
              <button
                onClick={() => removeToast(t.id)}
                className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
