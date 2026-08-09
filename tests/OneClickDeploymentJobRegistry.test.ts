import { OneClickDeploymentJobRegistry } from '../src/user/oneclick/OneClickDeploymentJobRegistry'

function storeWith(records: any[]) {
    return {
        getOneClickDeploymentJobs: jest.fn().mockResolvedValue(records),
        setOneClickDeploymentJobs: jest.fn().mockResolvedValue(undefined),
    } as any
}

test('hydration rejects malformed ids and marks unfinished jobs interrupted', async () => {
    const store = storeWith([
        {
            jobId: 'not-a-job',
            state: { steps: ['x'], currentStep: 0 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
        {
            jobId: 'deploy_123e4567-e89b-12d3-a456-426614174000',
            state: { steps: ['Deploying'], currentStep: 1 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
    ])
    const registry = OneClickDeploymentJobRegistry.getInstance()

    await registry.initialize(store)

    expect(registry.jobExists('not-a-job')).toBe(false)
    expect(
        registry.getJobState('deploy_123e4567-e89b-12d3-a456-426614174000')
    ).toMatchObject({
        error: 'Deployment interrupted by a control-plane restart.',
    })
})

test('new jobs use unpredictable validated identifiers', async () => {
    const store = storeWith([])
    const registry = OneClickDeploymentJobRegistry.getInstance()
    await registry.initialize(store)

    const jobId = registry.createJob()

    expect(jobId).toMatch(
        /^deploy_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
    expect(registry.getJobState(jobId)?.steps).toEqual(['Queuing deployment'])
})
