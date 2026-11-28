import { test } from "@playwright/test";
import { oakFenceRoute } from "./oak-fence";
test("Mobile: craft connected oak fences, block joystick jumping and retain drop ownership", async ({ page }, info) => {
  test.setTimeout(420_000); await oakFenceRoute(page, info, true);
});
