import { test } from "@playwright/test";
import { leashFollowFenceRoute, leashMobRecoveryRoute } from "./leashes";
test("PC: craft Leads, follow with collision, tie saved keys and jointly refund a fenced full-bag owner", async ({ page }, info) => { test.setTimeout(420_000); await leashFollowFenceRoute(page, info, false); });
test("PC: cached mob loot and Lead refund recover once, empty-hand detach and corrupt-original protection", async ({ page }, info) => { test.setTimeout(420_000); await leashMobRecoveryRoute(page, info, false); });
