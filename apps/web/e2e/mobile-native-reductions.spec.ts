import { test } from "@playwright/test";
import { nativeReductionRoute } from "./native-reductions";
test("Mobile: acquire native reducer Unknown, place it and preserve all outputs across saves", async ({ page }, info) => {
  test.setTimeout(180_000); await nativeReductionRoute(page, info, true);
});
