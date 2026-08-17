import type ServiceManager from '../ServiceManager'
import { redactText } from '../../utils/Redact'

const MAX_AGENT_BUILD_LOG_LINES = 500
const MAX_AGENT_BUILD_LOG_LINE_LENGTH = 2000
const MAX_DEPLOYMENT_DIAGNOSTICS_LENGTH = 8000

function sanitizeLines(lines: unknown[]) {
    return lines
        .filter((line) => `${line || ''}`.trim())
        .map((line) =>
            redactText(`${line}`).slice(0, MAX_AGENT_BUILD_LOG_LINE_LENGTH)
        )
        .slice(-MAX_AGENT_BUILD_LOG_LINES)
}

export function getAgentBuildLogSnapshot(
    serviceManager: ServiceManager,
    appName: string
) {
    const status = serviceManager.getBuildStatus(appName)

    return {
        isAppBuilding: status.isAppBuilding,
        isBuildFailed: status.isBuildFailed,
        lines: sanitizeLines(status.logs.lines),
    }
}

export function getAgentDeploymentDiagnostics(
    serviceManager: ServiceManager,
    appName: string,
    errorMessage?: string
) {
    const snapshot = getAgentBuildLogSnapshot(serviceManager, appName)
    const lines = errorMessage
        ? [...snapshot.lines, `Deployment error: ${errorMessage}`]
        : snapshot.lines

    let totalLength = 0
    return lines
        .reverse()
        .filter((line) => {
            if (totalLength >= MAX_DEPLOYMENT_DIAGNOSTICS_LENGTH) {
                return false
            }
            const remaining = MAX_DEPLOYMENT_DIAGNOSTICS_LENGTH - totalLength
            const retained = line.slice(0, remaining)
            totalLength += retained.length
            return !!retained
        })
        .reverse()
}
