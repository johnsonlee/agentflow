import { test } from "@playwright/test";
import { coloredTorchRoute } from "./colored-torches";

test("Mobile: craft four colored torches, place/light, save/restore and harvest", async ({ page }, info) => {
  test.setTimeout(240_000);
  await coloredTorchRoute(page, info, true);
});
