import assert from 'node:assert/strict'

import { chromium } from '@playwright/test'

const baseUrl = (
    process.env.CAPROVER_E2E_URL || 'http://127.0.0.1:3000'
).replace(/\/$/, '')
const password = process.env.CAPROVER_E2E_PASSWORD
const otpToken = process.env.CAPROVER_E2E_OTP || ''
const imageName = process.env.CAPROVER_E2E_IMAGE || 'nginx:alpine'
const timeoutMs = Number(process.env.CAPROVER_E2E_TIMEOUT_MS || 180000)
const headless = process.env.CAPROVER_E2E_HEADLESS !== 'false'

if (!password) {
    throw new Error(
        'CAPROVER_E2E_PASSWORD is required. It is the password of the test CapRover instance.'
    )
}

function apiPath(response, fragment) {
    return new URL(response.url()).pathname.includes(fragment)
}

async function readApiResponse(response, operation) {
    const payload = await response.json()
    assert.equal(
        response.ok(),
        true,
        `${operation} returned HTTP ${response.status()}: ${JSON.stringify(payload)}`
    )
    assert.ok(
        [100, 101, 102].includes(payload.status),
        `${operation} returned CapRover status ${payload.status}: ${payload.description}`
    )
    return payload
}

function assertHttpSuccess(response, operation) {
    assert.equal(
        response.ok(),
        true,
        `${operation} returned HTTP ${response.status()}.`
    )
}

async function waitForServer() {
    const deadline = Date.now() + Math.min(timeoutMs, 60000)

    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${baseUrl}/login`, {
                signal: AbortSignal.timeout(3000),
            })
            if (response.ok || response.status === 302) return
        } catch {
            // The server may still be starting.
        }

        await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    throw new Error(
        `CapRover did not become reachable at ${baseUrl} within 60 seconds.`
    )
}

async function login(page) {
    const deadline = Date.now() + Math.min(timeoutMs, 120000)
    let lastMessage = 'No login error was rendered.'

    while (Date.now() < deadline) {
        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel('Password').fill(password)

        await page.getByRole('button', { name: 'Sign in', exact: true }).click()

        const otpField = page.getByLabel('Authenticator code')
        const needsOtp = await otpField
            .waitFor({ state: 'visible', timeout: 1500 })
            .then(() => true)
            .catch(() => false)

        if (needsOtp) {
            assert.ok(
                otpToken,
                'This CapRover instance requires OTP. Set CAPROVER_E2E_OTP and retry.'
            )
            await otpField.fill(otpToken)
            await page
                .getByRole('button', { name: 'Sign in', exact: true })
                .click()
        }

        try {
            await page.waitForURL((url) => url.pathname === '/', {
                timeout: 5000,
            })
            return
        } catch (error) {
            lastMessage = await page
                .getByRole('alert')
                .innerText({ timeout: 1000 })
                .catch(() => 'No login error was rendered.')

            if (!lastMessage.toLocaleLowerCase().includes('not ready')) {
                throw new Error(
                    `Login did not complete at ${page.url()}: ${lastMessage}`,
                    { cause: error }
                )
            }

            await new Promise((resolve) => setTimeout(resolve, 2000))
        }
    }

    throw new Error(`CapRover did not become ready for login: ${lastMessage}`)
}

async function waitForDeployedVersion(request, appName, minimumVersion) {
    const deadline = Date.now() + timeoutMs
    const statusPath = `/api/caprover/user/apps/appData/${encodeURIComponent(appName)}`
    const definitionsPath = '/api/caprover/user/apps/appDefinitions/'
    let lastStatus
    let lastApp

    while (Date.now() < deadline) {
        const [statusResponse, definitionsResponse] = await Promise.all([
            request.get(`${statusPath}/`),
            request.get(definitionsPath),
        ])
        const statusPayload = await readApiResponse(
            statusResponse,
            'Build status'
        )
        const definitions = await readApiResponse(
            definitionsResponse,
            'Read app definitions'
        )
        const status = statusPayload.data || {}
        const app = (definitions.data?.appDefinitions || []).find(
            (candidate) => candidate.appName === appName
        )
        lastStatus = status
        lastApp = app

        if (status.isBuildFailed) {
            assert.equal(
                status.isBuildFailed,
                false,
                `Build failed for ${appName}: ${JSON.stringify(status.logs)}`
            )
        }

        const deployedVersion = Number(app?.deployedVersion || 0)
        const deployedVersionData = (app?.versions || []).find(
            (version) => version.version === deployedVersion
        )

        if (
            !status.isAppBuilding &&
            deployedVersion >= minimumVersion &&
            deployedVersionData?.deployedImageName
        ) {
            return app
        }

        await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    throw new Error(
        `Deployment for ${appName} did not finish within ${timeoutMs} ms: ${JSON.stringify({ lastStatus, lastApp })}`
    )
}

async function main() {
    await waitForServer()

    const browser = await chromium.launch({ headless })
    const context = await browser.newContext({ baseURL: baseUrl })
    const page = await context.newPage()
    const request = context.request
    const appName = `e2e-${Date.now().toString(36)}`
    let appCreated = false

    try {
        await login(page)

        const sidebar = page.locator('aside')
        await sidebar.waitFor({ state: 'visible' })
        await page
            .locator('aside')
            .getByRole('link', { name: 'Apps', exact: true })
            .click()
        await page.waitForURL((url) => url.pathname === '/apps')
        assert.equal(
            await sidebar.isVisible(),
            true,
            'The sidebar disappeared during route navigation.'
        )
        await page.getByRole('heading', { name: 'Apps', exact: true }).waitFor()
        await page.getByRole('button', { name: 'New app', exact: true }).click()
        await page.locator('#new-app-name').fill(appName)

        const registerResponse = await Promise.all([
            page.waitForResponse(
                (response) =>
                    response.request().method() === 'POST' &&
                    apiPath(
                        response,
                        '/api/caprover/user/apps/appDefinitions/register'
                    )
            ),
            page
                .getByRole('button', { name: 'Create app', exact: true })
                .click(),
        ]).then(([response]) => response)

        assertHttpSuccess(registerResponse, 'Create app')
        appCreated = true
        await page.getByRole('link', { name: appName, exact: true }).waitFor()
        await page.getByRole('link', { name: appName, exact: true }).click()
        await page
            .getByRole('heading', { name: appName, exact: true })
            .waitFor()

        const initialApp = await waitForDeployedVersion(request, appName, 0)
        const baselineVersion = Number(initialApp.deployedVersion || 0)

        await page.getByRole('button', { name: 'Deploy', exact: true }).click()
        await page.locator('#deploy-definition').fill(imageName)

        const deployResponse = await Promise.all([
            page.waitForResponse(
                (response) =>
                    response.request().method() === 'POST' &&
                    apiPath(
                        response,
                        `/api/caprover/user/apps/appData/${appName}`
                    )
            ),
            page
                .getByRole('button', { name: 'Deploy now', exact: true })
                .click(),
        ]).then(([response]) => response)

        assertHttpSuccess(deployResponse, 'Deploy app')
        const deployedApp = await waitForDeployedVersion(
            request,
            appName,
            baselineVersion + 1
        )

        const definitionsResponse = await request.get(
            '/api/caprover/user/apps/appDefinitions/'
        )
        const definitions = await readApiResponse(
            definitionsResponse,
            'Read app definitions'
        )
        const listedApp = (definitions.data?.appDefinitions || []).find(
            (app) => app.appName === appName
        )

        assert.ok(listedApp, `App ${appName} was not returned by CapRover.`)
        assert.ok(
            Number(listedApp.deployedVersion) > baselineVersion,
            `App ${appName} did not advance its deployed version: ${JSON.stringify(listedApp)}`
        )

        console.log(
            `E2E passed: ${appName} deployed ${imageName} as version ${deployedApp.deployedVersion}.`
        )
    } finally {
        if (appCreated && process.env.CAPROVER_E2E_KEEP_APP !== 'true') {
            const deleteResponse = await request.post(
                '/api/caprover/user/apps/appDefinitions/delete/',
                {
                    data: { appNames: [appName], volumes: [] },
                }
            )
            await readApiResponse(deleteResponse, 'Delete E2E app')
            console.log(`E2E cleanup passed: removed ${appName}.`)
        }

        await context.close()
        await browser.close()
    }
}

main().catch((error) => {
    console.error(
        `E2E failed: ${error instanceof Error ? error.message : error}`
    )
    process.exitCode = 1
})
