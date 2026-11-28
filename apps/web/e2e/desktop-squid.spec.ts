import { test } from "@playwright/test";
import { squidAquariumRoute, squidNaturalOceanRoute } from "./squid";

test("PC: swimming squid player/Agent ink, full-bag cold restore, signed book and Black Dye", async ({ page }, info) => {
  test.setTimeout(480_000); await squidAquariumRoute(page, info, false);
});
test("PC: actual generated ocean scheduler, living squid save, unsupported attachments and genuine ink", async ({ page }, info) => {
  test.setTimeout(420_000); await squidNaturalOceanRoute(page, info, false);
});
