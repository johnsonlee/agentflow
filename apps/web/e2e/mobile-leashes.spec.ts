import { test } from "@playwright/test";
import { leashFollowFenceRoute, leashMobRecoveryRoute } from "./leashes";
test("Mobile: craft Leads, joystick follow with collision, tie saved keys and jointly refund full-bag owners", async ({ page }, info) => { test.setTimeout(480_000); await leashFollowFenceRoute(page, info, true); });
test("Mobile: cached mob loot and Lead refund recover once, empty-hand detach and corrupt-original protection", async ({ page }, info) => { test.setTimeout(480_000); await leashMobRecoveryRoute(page, info, true); });
