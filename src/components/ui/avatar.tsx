import { cn, getInitials } from "@/lib/utils";

const COLORS = [
  "bg-brand-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
];

function getColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full text-white font-medium",
        getColor(name),
        {
          "h-7 w-7 text-xs": size === "sm",
          "h-9 w-9 text-sm": size === "md",
          "h-12 w-12 text-base": size === "lg",
        },
        className
      )}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}
