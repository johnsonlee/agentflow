import {test}from '@playwright/test';
import {agentAliasesRoute}from './agent-command-aliases';
test.describe.configure({retries:0});
test('desktop: owned Agent command aliases preserve27slots and cold definitions',async({page},info)=>{test.setTimeout(180000);await agentAliasesRoute(page,info,false);});
