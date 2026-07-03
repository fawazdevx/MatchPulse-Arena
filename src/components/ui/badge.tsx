import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-black transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-white/10 bg-white/10 text-white/[0.78] backdrop-blur",
        outline: "border-white/[0.16] text-white",
        live: "border-[#FF4664]/[0.24] bg-[#FF4664]/[0.14] text-[#FF9BAD]",
        creator: "border-[#A98CFF]/[0.24] bg-[#8B5CFF]/[0.16] text-[#D8CBFF]",
        win: "border-[#38E8A3]/[0.24] bg-[#22D391]/[0.16] text-[#8AF2C9]"
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
