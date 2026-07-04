import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      details
    },
    { status }
  );
}

export function parseCookie(header: string | null, name: string) {
  if (!header) return undefined;

  return header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

