import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../../app/api/internal/efi-card-notification/route.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("./efi-card-service.ts", import.meta.url), "utf8");

test("notification POST delegates to authenticated notification lookup before settlement", () => {
  assert.match(route, /processNotification\(token\)/);
  assert.doesNotMatch(route, /process_efi_card_settlement/);
  assert.match(service, /const notification = await getEfiCardNotification\(notificationToken\)/);
  assert.match(service, /process_efi_card_settlement/);
});

test("notification accepts a bounded form token only", () => {
  assert.match(route, /application\/x-www-form-urlencoded/);
  assert.match(route, /key !== "notification"/);
  assert.match(route, /token\.length === 0 \|\| token\.length > 512/);
});
