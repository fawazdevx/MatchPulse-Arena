import test from "node:test";
import assert from "node:assert/strict";
import { creatorRoomErrorMessage, creatorRoomErrorMessages } from "./errors.ts";

test("creator room errors never expose unknown server messages", () => {
  assert.equal(
    creatorRoomErrorMessage("Prisma Client is not generated. Run npm run db:generate.", 500),
    creatorRoomErrorMessages.CREATOR_ROOM_CREATE_FAILED
  );
  assert.equal(creatorRoomErrorMessage(undefined, 503), creatorRoomErrorMessages.CREATOR_ROOM_UNAVAILABLE);
  assert.equal(creatorRoomErrorMessage("AUTH_REQUIRED", 401), creatorRoomErrorMessages.AUTH_REQUIRED);
});
