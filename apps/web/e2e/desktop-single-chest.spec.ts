import { test } from '@playwright/test';
import { chestRoute } from './single-chest';
test.describe.configure({ retries: 0 });
test('desktop: actual SingleChest transfers cursorcold realms Player and Agent metadata receipts', async ({ page }, info) => { test.setTimeout(720000); await chestRoute(page, info, false); });
