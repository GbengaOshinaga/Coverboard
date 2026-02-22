import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline" | "success" | "warning" | "error";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        {
          "bg-brand-100 text-brand-700": variant === "default",
          "border border-gray-300 text-gray-700": variant === "outline",
          "bg-green-100 text-green-700": variant === "success",
          "bg-yellow-100 text-yellow-700": variant === "warning",
          "bg-red-100 text-red-700": variant === "error",
        },
        className
      )}
      {...props}
    />
  );
}
