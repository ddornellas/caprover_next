import DiskCleanupManager from '../src/user/system/DiskCleanupManager'

function createManager() {
    const dockerApi = {
        getImages: jest.fn().mockResolvedValue([
            { Id: 'caprover-image', RepoTags: ['registry/img-captain-app:1'] },
            { Id: 'unrelated-image', RepoTags: ['postgres:16'] },
        ]),
        deleteImages: jest.fn().mockResolvedValue(undefined),
    }
    const dataStore = {
        getAppsDataStore: () => ({
            getAppDefinitions: jest.fn().mockResolvedValue({
                app: {
                    deployedVersion: 2,
                    versions: [
                        {
                            version: 1,
                            deployedImageName: 'registry/img-captain-app:1',
                        },
                    ],
                },
            }),
        }),
    }

    return {
        manager: new DiskCleanupManager(dataStore as any, dockerApi as any),
        dockerApi,
    }
}

test('unused image discovery only returns CapRover-owned image tags', async () => {
    const { manager } = createManager()

    await expect(manager.getUnusedImages(0)).resolves.toEqual([
        {
            id: 'caprover-image',
            tags: ['registry/img-captain-app:1'],
        },
    ])
})

test('image deletion skips IDs that are not currently safe to delete', async () => {
    const { manager, dockerApi } = createManager()

    await manager.deleteImages(['caprover-image', 'unrelated-image'])

    expect(dockerApi.deleteImages).toHaveBeenCalledWith(['caprover-image'])
})

test('cleanup limit must be a bounded integer', async () => {
    const { manager } = createManager()

    await expect(manager.getUnusedImages(Number.NaN)).rejects.toMatchObject({
        captainErrorType: expect.anything(),
    })
})

test('cleanup leaves CapRover-looking images without ownership proof untouched', async () => {
    const dockerApi = {
        getImages: jest.fn().mockResolvedValue([
            {
                Id: 'unknown-image',
                RepoTags: ['registry/img-captain-other:1'],
            },
        ]),
    }
    const dataStore = {
        getAppsDataStore: () => ({
            getAppDefinitions: jest.fn().mockResolvedValue({}),
        }),
    }

    await expect(
        new DiskCleanupManager(
            dataStore as any,
            dockerApi as any
        ).getUnusedImages(0)
    ).resolves.toEqual([])
})
