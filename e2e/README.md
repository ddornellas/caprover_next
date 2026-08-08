# CapRover E2E smoke test

The smoke test exercises the migrated Next.js interface against a real CapRover instance:

1. signs in through `/login`;
2. creates an app through `/apps`;
3. deploys `nginx:alpine` through the app's Deploy tab;
4. polls the real build status and verifies the deployed version;
5. removes the temporary app.

Start the full server with Docker and a test data directory, then run:

```bash
IS_CAPTAIN_INSTANCE=1 \
DEFAULT_PASSWORD='your-test-password' \
CAPTAIN_BASE_DIRECTORY=/captain \
npm run dev:next
```

In another terminal, install the Playwright browser once and run the test:

```bash
npm run e2e:install
CAPROVER_E2E_PASSWORD='your-test-password' npm run e2e
```

Useful overrides are `CAPROVER_E2E_URL`, `CAPROVER_E2E_IMAGE`,
`CAPROVER_E2E_TIMEOUT_MS`, `CAPROVER_E2E_OTP`, and
`CAPROVER_E2E_KEEP_APP=true`.
