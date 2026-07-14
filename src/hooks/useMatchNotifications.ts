import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchFixture, ReplayTick } from "@/lib/types";

type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported";

const HIGH_SIGNAL_TYPES = new Set(["goal", "red_card", "full_time"]);
const SENTIMENT_SWING_THRESHOLD = 8;

function isSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

// A tick is "notify-worthy" only when it is a real, meaningful moment — not a
// heartbeat, not a delayed/setup tick, and not a low-impact momentum blip. This
// keeps notifications rare and trustworthy instead of spamming every 8s poll.
function isNotifiableTick(tick: ReplayTick) {
  if (tick.dataQuality === "delayed") return false;

  const event = tick.event;
  if (!event) return false;
  if (event.id.startsWith("heartbeat-") || event.id.startsWith("unavailable-")) return false;

  if (event.impact === "high") return true;
  if (HIGH_SIGNAL_TYPES.has(event.type)) return true;
  if ((tick.sentiment?.delta ?? 0) >= SENTIMENT_SWING_THRESHOLD) return true;

  return false;
}

function notificationBody(tick: ReplayTick, fixture: MatchFixture) {
  const scoreline = tick.score ? `${fixture.home.shortName} ${tick.score.home}–${tick.score.away} ${fixture.away.shortName}` : `${fixture.home.shortName} vs ${fixture.away.shortName}`;
  return `${scoreline} · ${tick.event.description}`;
}

/**
 * Tier-1 match notifications: fires a native browser notification for high-signal
 * TxLINE events (goal, red card, full time, big odds swing) — but only while the
 * tab is backgrounded, so an in-focus fan is never interrupted. Built entirely on
 * the existing SSE stream: no service worker, no server push, no new infra.
 */
export function useMatchNotifications() {
  const [permission, setPermission] = useState<NotificationPermissionState>("default");
  const lastNotifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupported()) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as NotificationPermissionState);
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported()) return "unsupported" as const;
    try {
      const result = await Notification.requestPermission();
      setPermission(result as NotificationPermissionState);
      return result;
    } catch {
      return Notification.permission;
    }
  }, []);

  const notifyFromTick = useCallback((tick: ReplayTick, fixture: MatchFixture | undefined) => {
    if (!fixture || !isSupported()) return;
    if (Notification.permission !== "granted") return;
    // Only notify when the fan has left the tab — an in-focus fan already sees it.
    if (typeof document !== "undefined" && !document.hidden) return;
    if (!isNotifiableTick(tick)) return;
    if (lastNotifiedRef.current === tick.event.id) return;

    lastNotifiedRef.current = tick.event.id;

    try {
      const notification = new Notification(`${tick.event.title} · ${fixture.home.shortName} vs ${fixture.away.shortName}`, {
        body: notificationBody(tick, fixture),
        tag: `matchpulse-${fixture.id}`
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // Notification construction can throw on some mobile browsers without a
      // service worker; degrade silently rather than break the live room.
    }
  }, []);

  return {
    permission,
    isSupported: permission !== "unsupported",
    canPrompt: permission === "default",
    requestPermission,
    notifyFromTick
  };
}
