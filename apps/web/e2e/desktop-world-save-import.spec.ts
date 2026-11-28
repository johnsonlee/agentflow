import { test } from "@playwright/test";
import { validWorldImport, refusedWorldImports, staleOtherTabImport } from "./world-save-import";
test("world JSON genuine backup preview replace and cold Continue", async ({ page }, info) => validWorldImport(page, info, false));
test("world JSON format read quota and late-file cancellation refusals", async ({ page }, info) => refusedWorldImports(page, info, false));
test("world JSON other-tab replacement invalidates stale preview", async ({ page }, info) => staleOtherTabImport(page, info, false));
