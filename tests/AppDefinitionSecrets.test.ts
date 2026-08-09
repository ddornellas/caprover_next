import { getAllAppDefinitions } from '../src/handlers/users/apps/appdefinition/AppDefinitionHandler'

function createStore() {
    const app = {
        description: '',
        deployedVersion: 1,
        notExposeAsWebApp: false,
        hasPersistentData: false,
        hasDefaultSubDomainSsl: false,
        captainDefinitionRelativeFilePath: 'captain-definition',
        forceSsl: false,
        websocketSupport: false,
        instanceCount: 1,
        networks: [],
        customDomain: [],
        ports: [],
        volumes: [],
        envVars: [],
        versions: [],
        appDeployTokenConfig: {
            enabled: true,
            appDeployToken: 'deploy-secret',
        },
        appPushWebhook: {
            tokenVersion: 'v1',
            pushWebhookToken: 'webhook-secret',
            repoInfo: {
                repo: 'owner/repo',
                branch: 'main',
                user: 'bot',
                password: 'git-secret',
                sshKey: 'private-key',
            },
        },
    }

    return {
        getAppsDataStore: () => ({
            getAppDefinitions: jest.fn().mockResolvedValue({ app }),
        }),
        getDefaultAppNginxConfig: jest.fn().mockResolvedValue(''),
        getAgentDeploymentRequests: jest.fn().mockResolvedValue([]),
        getRootDomain: jest.fn().mockReturnValue('captain.example'),
    } as any
}

test('modern app listings redact all deploy and webhook secrets', async () => {
    const result = await getAllAppDefinitions(
        createStore(),
        { isAppBuilding: jest.fn().mockReturnValue(false) } as any,
        { redactSecrets: true }
    )
    const app = result.data.appDefinitions[0]

    expect(app.appDeployTokenConfig.appDeployToken).toBe('[REDACTED]')
    expect(app.appPushWebhook.pushWebhookToken).toBe('[REDACTED]')
    expect(app.appPushWebhook.repoInfo.password).toBe('[REDACTED]')
    expect(app.appPushWebhook.repoInfo.sshKey).toBe('[REDACTED]')
})

test('legacy app listings preserve the historical response contract', async () => {
    const result = await getAllAppDefinitions(createStore(), {
        isAppBuilding: jest.fn().mockReturnValue(false),
    } as any)
    const app = result.data.appDefinitions[0]

    expect(app.appDeployTokenConfig.appDeployToken).toBe('deploy-secret')
    expect(app.appPushWebhook.pushWebhookToken).toBe('webhook-secret')
    expect(app.appPushWebhook.repoInfo.password).toBe('[REDACTED]')
})
