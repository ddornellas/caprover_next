import { randomUUID } from 'crypto'

import type DataStore from '../../datastore/DataStore'
import type {
    IDeploymentState,
    OneClickDeploymentJobRecord,
} from '../../models/OneClickDeploymentJob'
import Logger from '../../utils/Logger'
import { redactText } from '../../utils/Redact'

export type { IDeploymentState } from '../../models/OneClickDeploymentJob'

interface IJobInfo {
    jobId: string
    state: IDeploymentState
    createdAt: Date
    updatedAt: Date
}

const MAX_JOBS = 200
const MAX_JOB_AGE_MS = 24 * 60 * 60 * 1000
const MAX_STEPS = 100
const MAX_STEP_LENGTH = 200
const MAX_MESSAGE_LENGTH = 2000
const JOB_ID_PATTERN =
    /^deploy_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sanitizeMessage(value: string) {
    return redactText(value)
        .replace(
            /(token|password|secret|api[_-]?key|authorization)=([^&\s]+)/gi,
            '$1=[REDACTED]'
        )
        .replace(
            /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g,
            '[PRIVATE_KEY_REDACTED]'
        )
        .slice(0, MAX_MESSAGE_LENGTH)
}

function normalizeState(state: IDeploymentState): IDeploymentState {
    const steps = Array.isArray(state?.steps)
        ? state.steps
              .filter((step): step is string => typeof step === 'string')
              .slice(0, MAX_STEPS)
              .map((step) => step.slice(0, MAX_STEP_LENGTH))
        : []

    return {
        steps,
        currentStep: Number.isFinite(state?.currentStep)
            ? Math.max(0, Math.min(steps.length, Math.floor(state.currentStep)))
            : 0,
        error:
            typeof state?.error === 'string'
                ? sanitizeMessage(state.error)
                : '',
        successMessage:
            typeof state?.successMessage === 'string'
                ? sanitizeMessage(state.successMessage)
                : undefined,
    }
}

/**
 * Bounded deployment progress registry. State is mirrored to the root
 * datastore so a control-plane restart does not make an in-flight operation
 * impossible to inspect. The registry intentionally stores progress only;
 * deployment templates and credentials never belong in the job record.
 */
export class OneClickDeploymentJobRegistry {
    private static instance: OneClickDeploymentJobRegistry
    private jobs: Map<string, IJobInfo> = new Map()
    private dataStore: DataStore | undefined
    private hydratedFor: DataStore | undefined
    private hydrationPromise: Promise<void> | undefined
    private persistenceQueue: Promise<void> = Promise.resolve()

    private constructor() {
        this.startAutomaticCleanup()
    }

    public static getInstance(): OneClickDeploymentJobRegistry {
        if (!OneClickDeploymentJobRegistry.instance) {
            OneClickDeploymentJobRegistry.instance =
                new OneClickDeploymentJobRegistry()
        }
        return OneClickDeploymentJobRegistry.instance
    }

    public async initialize(dataStore: DataStore) {
        this.dataStore = dataStore
        if (this.hydratedFor === dataStore && this.hydrationPromise) {
            return this.hydrationPromise
        }

        this.hydratedFor = dataStore
        const hydrationPromise = (async () => {
            const now = Date.now()
            const persisted = await dataStore.getOneClickDeploymentJobs()
            this.jobs.clear()

            ;(Array.isArray(persisted) ? persisted : []).forEach((record) => {
                const createdAt = new Date(record.createdAt)
                const updatedAt = new Date(record.updatedAt)
                if (
                    !JOB_ID_PATTERN.test(`${record.jobId || ''}`) ||
                    Number.isNaN(createdAt.getTime()) ||
                    Number.isNaN(updatedAt.getTime()) ||
                    now - updatedAt.getTime() > MAX_JOB_AGE_MS
                ) {
                    return
                }

                const state = normalizeState(record.state)
                // A persisted job cannot safely resume after the control
                // plane restarted because its deployment credentials and
                // template are intentionally not stored in the registry.
                if (!state.error && !state.successMessage) {
                    state.error =
                        'Deployment interrupted by a control-plane restart.'
                }

                this.jobs.set(record.jobId, {
                    jobId: record.jobId,
                    state,
                    createdAt,
                    updatedAt,
                })
            })

            this.trimJobs()
            this.persist()
        })()

        this.hydrationPromise = hydrationPromise.catch((error) => {
            if (this.hydratedFor === dataStore) {
                this.hydratedFor = undefined
                this.hydrationPromise = undefined
            }
            throw error
        })
        return this.hydrationPromise
    }

    /** Generate an unpredictable job ID; progress URLs are still auth-gated. */
    private generateJobId(): string {
        return `deploy_${randomUUID()}`
    }

    public createJob(): string {
        const now = new Date()
        const jobId = this.generateJobId()
        const jobInfo: IJobInfo = {
            jobId,
            state: normalizeState({
                steps: ['Queuing deployment'],
                currentStep: 0,
                error: '',
                successMessage: '',
            }),
            createdAt: now,
            updatedAt: now,
        }

        this.jobs.set(jobId, jobInfo)
        this.trimJobs()
        this.persist()
        return jobId
    }

    public updateJobProgress(
        jobId: string,
        newState: IDeploymentState
    ): boolean {
        const jobInfo = this.jobs.get(jobId)
        if (!jobInfo) return false

        jobInfo.state = normalizeState(newState)
        jobInfo.updatedAt = new Date()
        this.persist()
        return true
    }

    public getJobState(jobId: string): IDeploymentState | null {
        const jobInfo = this.jobs.get(jobId)
        return jobInfo
            ? { ...jobInfo.state, steps: [...jobInfo.state.steps] }
            : null
    }

    public jobExists(jobId: string): boolean {
        return this.jobs.has(jobId)
    }

    public removeJob(jobId: string): boolean {
        const removed = this.jobs.delete(jobId)
        if (removed) this.persist()
        return removed
    }

    public getAllJobIds(): string[] {
        return Array.from(this.jobs.keys())
    }

    cleanupOldJobs(olderThanHours = 24): number {
        const cutoffTime =
            Date.now() - Math.max(1, olderThanHours) * 60 * 60 * 1000
        let removedCount = 0

        for (const [jobId, jobInfo] of this.jobs.entries()) {
            if (jobInfo.updatedAt.getTime() < cutoffTime) {
                this.jobs.delete(jobId)
                removedCount++
            }
        }

        if (removedCount > 0) this.persist()
        return removedCount
    }

    private trimJobs() {
        while (this.jobs.size > MAX_JOBS) {
            const oldest = this.jobs.keys().next().value as string | undefined
            if (!oldest) break
            this.jobs.delete(oldest)
        }
    }

    private persist() {
        if (!this.dataStore) return

        const records: OneClickDeploymentJobRecord[] = Array.from(
            this.jobs.values()
        ).map((job) => ({
            jobId: job.jobId,
            state: normalizeState(job.state),
            createdAt: job.createdAt.toISOString(),
            updatedAt: job.updatedAt.toISOString(),
        }))

        const write = this.persistenceQueue.then(() =>
            this.dataStore!.setOneClickDeploymentJobs(records)
        )
        this.persistenceQueue = write.catch((error) => {
            Logger.e(error, 'Unable to persist one-click deployment progress')
        })
    }

    private startAutomaticCleanup() {
        const timer = setInterval(
            () => {
                const removedCount = this.cleanupOldJobs(24)
                if (removedCount > 0) {
                    Logger.d(
                        `OneClick deployment cleanup: removed ${removedCount} old job(s)`
                    )
                }
            },
            4 * 60 * 60 * 1000
        )
        timer.unref?.()
    }
}
