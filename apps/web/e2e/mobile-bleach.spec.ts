import { test } from "@playwright/test";
import { bleachRoute } from "./bleach";

test("Mobile: create NaClO, manufacture bleach, whiten wool and preserve distinct saves", async ({ page }, info) => {
  test.setTimeout(240_000);
  await bleachRoute(page, info, true);
});
