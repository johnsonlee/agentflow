import { test } from "@playwright/test";
import { snowballProjectileRoute } from "./snowball-projectiles";
test("PC: throw snowballs into mobs, walls and sky, preserve flight and refuse damaged saves", async ({ page }, info) => {
  test.setTimeout(240_000); await snowballProjectileRoute(page, info, false);
});
