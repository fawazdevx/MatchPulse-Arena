export const creatorRoomErrorMessages = {
  INVALID_REQUEST: "Check the room details and try again.",
  AUTH_REQUIRED: "Reconnect your Solana wallet, then try again.",
  FIXTURE_UNAVAILABLE: "That match is unavailable. Pick another match and try again.",
  TXLINE_UNAVAILABLE: "Live match data is temporarily unavailable. Try again in a moment.",
  CREATOR_ROOM_UNAVAILABLE: "Creator Cup rooms are temporarily unavailable. Try again in a moment.",
  CREATOR_ROOM_CREATE_FAILED: "We couldn't create your Creator Cup room. Please try again."
} as const;

export type CreatorRoomErrorCode = keyof typeof creatorRoomErrorMessages;

export function creatorRoomErrorMessage(code: unknown, status?: number) {
  if (typeof code === "string" && code in creatorRoomErrorMessages) {
    return creatorRoomErrorMessages[code as CreatorRoomErrorCode];
  }

  if (status === 401) return creatorRoomErrorMessages.AUTH_REQUIRED;
  if (status === 422) return creatorRoomErrorMessages.FIXTURE_UNAVAILABLE;
  if (status === 503) return creatorRoomErrorMessages.CREATOR_ROOM_UNAVAILABLE;
  return creatorRoomErrorMessages.CREATOR_ROOM_CREATE_FAILED;
}
