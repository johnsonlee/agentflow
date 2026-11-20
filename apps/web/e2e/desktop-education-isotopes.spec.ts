import { test } from "@playwright/test";
import { educationIsotopeRoute } from "./education-isotopes";

test("PC: construct guide isotopes, inspect owned atoms, make benzene and restore lookup items", async ({ page }, info) => {
  test.setTimeout(240_000);
  await educationIsotopeRoute(page, info, false);
});
