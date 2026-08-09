import { CronJob } from 'cron'
import { ImageInfo } from 'dockerode'
import ApiStatusCodes from '../../api/ApiStatusCodes'
import DataStore from '../../datastore/DataStore'
import DockerApi from '../../docker/DockerApi'
import { IAutomatedCleanupConfigs } from '../../models/AutomatedCleanupConfigs'
import Logger from '../../utils/Logger'
import Utils from '../../utils/Utils'

export default class DiskCleanupManager {
    private job: CronJob | undefined
    constructor(
        private dataStore: DataStore,
        private dockerApi: DockerApi
    ) {
        //
    }

    init() {
        return this.resetScheduledTasks() //
            .catch((e) => {
                Logger.e('Disk cleanup manager failed to start.')
                Logger.e(e)
            })
    }

    onCleanupCalled(mostRecentLimit: number) {
        const self = this

        Logger.d('Disk cleanup called...')

        return Promise.resolve()
            .then(() => {
                return self.getUnusedImages(mostRecentLimit)
            })
            .then((unusedImages) => {
                if (unusedImages.length > 0) {
                    Logger.d('Unused images found. Deleting...')

                    const imageIds = unusedImages.map((x) => x.id)

                    return self.deleteImages(imageIds)
                } else {
                    Logger.d('No unused images found.')
                }
            })
            .catch(function (error) {
                Logger.d('Disk cleanup failed. Silently ignoring...')
                Logger.e(error)
            })
    }

    deleteImages(imageIds: string[]) {
        Logger.d('Deleting images...')

        const dockerApi = this.dockerApi

        return Promise.resolve()
            .then(() => this.getUnusedImages(0))
            .then((unusedImages) => {
                const requestedImageIds = Array.isArray(imageIds)
                    ? imageIds
                    : []
                const allowedIds = new Set(
                    unusedImages.map((image) => image.id)
                )
                const safeImageIds = requestedImageIds
                    .filter((imageId) => typeof imageId === 'string')
                    .filter((imageId) => allowedIds.has(imageId))

                if (safeImageIds.length !== requestedImageIds.length) {
                    Logger.w(
                        'Skipped image deletion for resources that are not unused CapRover images.'
                    )
                }

                return dockerApi.deleteImages(safeImageIds)
            })
    }

    getUnusedImages(mostRecentLimit: number) {
        Logger.d(
            `Getting unused images, excluding most recent ones: ${mostRecentLimit}`
        )

        const dockerApi = this.dockerApi
        const dataStore = this.dataStore
        let allImages: ImageInfo[]

        return Promise.resolve()
            .then(function () {
                return dockerApi.getImages()
            })
            .then(function (images) {
                allImages = images

                return dataStore.getAppsDataStore().getAppDefinitions()
            })
            .then(function (apps) {
                const unusedImages = []
                const ownedImageTags = new Set<string>()

                // A name that merely resembles a CapRover image is not proof
                // of ownership. Only images recorded in persisted CapRover
                // app versions and produced by the generated image naming
                // convention are eligible for deletion. Unknown/legacy
                // resources remain untouched until ownership is explicit.
                Object.values(apps).forEach((app) => {
                    ;(app.versions || []).forEach((version) => {
                        const imageName = version.deployedImageName || ''
                        if (/(^|\/)img-captain-[^/:]+:\d+$/.test(imageName)) {
                            ownedImageTags.add(imageName)
                        }
                    })
                })

                if (
                    !Number.isInteger(mostRecentLimit) ||
                    mostRecentLimit < 0 ||
                    mostRecentLimit > 1000
                ) {
                    throw ApiStatusCodes.createError(
                        ApiStatusCodes.ILLEGAL_PARAMETER,
                        'Most Recent Limit must be an integer between 0 and 1000'
                    )
                }

                for (let i = 0; i < allImages.length; i++) {
                    const currentImage = allImages[i]
                    let imageInUse = false

                    const repoTags = currentImage.RepoTags || []

                    Object.keys(apps).forEach(function (appName) {
                        const app = apps[appName]
                        for (let k = 0; k < mostRecentLimit + 1; k++) {
                            const versionToCheck =
                                Number(app.deployedVersion) - k

                            if (versionToCheck < 0) continue

                            let deployedImage = ''
                            ;(app.versions || []).forEach((v) => {
                                if (v.version === versionToCheck) {
                                    deployedImage = v.deployedImageName || ''
                                }
                            })

                            if (!deployedImage) continue

                            if (repoTags.indexOf(deployedImage) >= 0) {
                                imageInUse = true
                            }
                        }
                    })

                    const isCapRoverImage = repoTags.some((tag) =>
                        ownedImageTags.has(tag)
                    )

                    if (!imageInUse && isCapRoverImage) {
                        unusedImages.push({
                            id: currentImage.Id,
                            tags: repoTags,
                        })
                    }
                }

                return unusedImages
            })
    }

    resetScheduledTasks() {
        const self = this
        if (this.job) {
            this.job.stop()
            this.job = undefined
        }

        return Promise.resolve()
            .then(() => {
                return self.getConfigs()
            })
            .then((configs) => {
                if (configs.cronSchedule) {
                    self.job = new CronJob(
                        configs.cronSchedule, // cronTime
                        function () {
                            self.onCleanupCalled(configs.mostRecentLimit)
                        }, // onTick
                        null, // onComplete
                        true, // start
                        configs.timezone // timezone
                    )
                }
            })
    }

    setConfig(configs: IAutomatedCleanupConfigs) {
        const self = this

        return Promise.resolve()
            .then(() => {
                configs.cronSchedule = (configs.cronSchedule || '').trim()
                if (configs.mostRecentLimit < 0) {
                    throw ApiStatusCodes.createError(
                        ApiStatusCodes.ILLEGAL_PARAMETER,
                        'Most Recent Limit cannot be negative'
                    )
                }

                if (!configs.cronSchedule) {
                    return // no need to validate cron schedule
                }

                if (!Utils.validateCron(configs.cronSchedule)) {
                    throw ApiStatusCodes.createError(
                        ApiStatusCodes.ILLEGAL_PARAMETER,
                        'Invalid cron schedule'
                    )
                }
            })
            .then(() => {
                if (!configs.cronSchedule) {
                    configs.timezone = ''
                    configs.mostRecentLimit = 1
                }

                return self.dataStore.setDiskCleanupConfigs(configs)
            })
            .then(() => {
                return self.resetScheduledTasks()
            })
    }

    getConfigs() {
        const self = this

        return Promise.resolve().then(() => {
            return self.dataStore.getDiskCleanupConfigs()
        })
    }
}
