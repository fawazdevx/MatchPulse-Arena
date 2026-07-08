"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { flagSrc } from "@/lib/country-flags";

interface TeamCrestProps {
  name: string;
  crest: string;
  color: string;
  className?: string;
  rounded?: string;
}

/**
 * Renders a country flag SVG when the team name maps to a nation, otherwise
 * falls back to the colored initials crest. Also falls back if the SVG fails
 * to load, so nothing ever renders broken.
 */
export function TeamCrest({ name, crest, color, className, rounded = "rounded-2xl" }: TeamCrestProps) {
  const src = flagSrc(name);
  const [failed, setFailed] = useState(false);
  const showFlag = src && !failed;

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden text-xs font-black text-white ring-1 ring-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.35)]",
        rounded,
        className
      )}
      style={showFlag ? undefined : { backgroundColor: color }}
      aria-label={name}
      role="img"
    >
      {showFlag ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          draggable={false}
        />
      ) : (
        crest
      )}
    </span>
  );
}
