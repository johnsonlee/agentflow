import { test } from "@playwright/test";
import { squidAquariumRoute, squidNaturalOceanRoute } from "./squid";

test("Mobile: touch swimming squid player/Agent ink, full-bag cold restore, signed book and Black Dye", async ({ page }, info) => {
  test.setTimeout(540_000); await squidAquariumRoute(page, info, true);
});
test("Mobile: actual generated ocean scheduler, living squid save, unsupported attachments and genuine ink", async ({ page }, info) => {
  test.setTimeout(480_000); await squidNaturalOceanRoute(page, info, true);
});
