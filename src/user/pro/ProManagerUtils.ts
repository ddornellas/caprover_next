import {
    IProConfig,
    ProAlertActionType,
    ProAlertEvent,
} from '../../models/IProFeatures'

export default class ProManagerUtils {
    public static ensureProConfigType(pc: unknown) {
        const proConfig: IProConfig = {
            alerts: [],
        }

        if (!pc || typeof pc !== 'object') return proConfig

        const candidate = pc as { alerts?: unknown }
        if (!Array.isArray(candidate.alerts)) return proConfig

        const validEvents = Object.values(ProAlertEvent) as string[]
        const validActionTypes = Object.values(ProAlertActionType) as string[]
        const seen = new Set<string>()

        candidate.alerts.forEach((item) => {
            if (!item || typeof item !== 'object') return

            const alert = item as {
                event?: unknown
                action?: unknown
            }
            const actionCandidate = alert.action
            if (!actionCandidate || typeof actionCandidate !== 'object') return

            const action = actionCandidate as {
                actionType?: unknown
                metadata?: unknown
            }
            const event =
                typeof alert.event === 'string' ? alert.event.trim() : ''
            const actionType =
                typeof action.actionType === 'string'
                    ? action.actionType.trim()
                    : ''

            if (
                !validEvents.includes(event) ||
                !validActionTypes.includes(actionType)
            ) {
                return
            }

            const key = `${event}:${actionType}`
            if (seen.has(key)) return
            seen.add(key)

            proConfig.alerts.push({
                event: event as ProAlertEvent,
                action: {
                    actionType: actionType as ProAlertActionType,
                    metadata: action.metadata,
                },
            })
        })

        return proConfig
    }
}
