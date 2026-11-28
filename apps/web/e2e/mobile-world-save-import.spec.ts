import { test } from "@playwright/test";
import { validWorldImport, refusedWorldImports, staleOtherTabImport } from "./world-save-import";
test("world JSON genuine backup preview replace and cold Continue portrait and landscape", async ({ page }, info) => validWorldImport(page, info, true));
test("world JSON format read quota and late-file cancellation portrait and landscape", async ({ page }, info) => refusedWorldImports(page, info, true));
test("world JSON other-tab replacement invalidates stale preview by touch", async ({ page }, info) => staleOtherTabImport(page, info, true));
