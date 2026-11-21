import { test } from "@playwright/test";
import { reducerCapacityRoute } from "./reducer-capacity";
test("PC: reducer commits complete output batches or preserves input and inventory", async ({ page }, info) => {
  test.setTimeout(180_000);
  await reducerCapacityRoute(page, info, false);
});
