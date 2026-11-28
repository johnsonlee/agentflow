import { test } from "@playwright/test";
import { sourceWorkspaceRoute } from "./source-workspace";
test("desktop: inert two-language source cold saves, storage refusal repair and explicit finite Run", async ({ page }, info) => {
  test.setTimeout(600_000); await sourceWorkspaceRoute(page, info, false, { width: 1280, height: 720 });
});
