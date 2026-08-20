import assert from "node:assert/strict";
import test from "node:test";
import { resolveEfiRuntimeConfig } from "./efi-config.ts";

test("Efí stays disabled without an explicit enablement flag",()=>assert.throws(()=>resolveEfiRuntimeConfig({} as NodeJS.ProcessEnv),/EFI_DISABLED/));
test("Efí requires every future secret and a certificate in sandbox",()=>assert.throws(()=>resolveEfiRuntimeConfig({EFI_ENABLED:"true",EFI_ENVIRONMENT:"sandbox"} as unknown as NodeJS.ProcessEnv),/EFI_CLIENT_ID_MISSING/));
test("Efí production remains blocked even when configuration is supplied",()=>assert.throws(()=>resolveEfiRuntimeConfig({EFI_ENABLED:"true",EFI_ENVIRONMENT:"production"} as unknown as NodeJS.ProcessEnv),/EFI_PRODUCTION_DISABLED/));
