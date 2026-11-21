import { test } from "@playwright/test";
import { balloonChemistryLiftRoute, balloonOwnershipRoute } from "./balloons";
test("Mobile: construct elements and Latex, craft two balloon colors and lift the same pig with roof collision", async ({ page }, info) => { test.setTimeout(480_000); await balloonChemistryLiftRoute(page, info, true); });
test("Mobile: crafted balloon fence detach, full-bag cold recovery, destructive pop and corrupt original backup", async ({ page }, info) => { test.setTimeout(480_000); await balloonOwnershipRoute(page, info, true); });
