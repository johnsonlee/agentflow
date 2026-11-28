import { test } from "@playwright/test";
import { sourceWorkspaceRoute } from "./source-workspace";
test("mobile: portrait and landscape source cold saves, oversize repair and explicit finite Run", async ({ page }, info) => {
  test.setTimeout(600_000); await sourceWorkspaceRoute(page, info, true, { width: 390, height: 844 }); await sourceWorkspaceRoute(page, info, true, { width: 915, height: 412 });
});
