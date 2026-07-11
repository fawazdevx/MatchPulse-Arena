import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-black transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-electric text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
        secondary: "border-white/[0.1] bg-surface-muted text-white/[0.82]",
        outline: "border-white/[0.16] text-white",
        live: "border-[#FF3B30]/[0.35] bg-[#FF3B30]/[0.14] text-[#FF8A82]",
        creator: "border-[#A98CFF]/[0.32] bg-[#8B5CFF]/[0.18] text-[#DED2FF]",
        win: "border-[#21E6A3]/[0.32] bg-[#21E6A3]/[0.16] text-[#7BF0CC]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
