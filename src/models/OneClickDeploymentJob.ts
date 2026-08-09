export interface IDeploymentState {
    steps: string[]
    error: string
    successMessage?: string
    currentStep: number
}

export interface OneClickDeploymentJobRecord {
    jobId: string
    state: IDeploymentState
    createdAt: string
    updatedAt: string
}
