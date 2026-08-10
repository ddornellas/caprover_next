import {
    IProConfig,
    ProAlertActionType,
    ProAlertEvent,
} from '../../models/IProFeatures'
import ApiStatusCodes from '../../api/ApiStatusCodes'

export default class ProManagerUtils {
    private static invalidConfig(message: string): never {
        throw ApiStatusCodes.createError(
            ApiStatusCodes.ILLEGAL_PARAMETER,
            message
        )
    }

    public static validateProConfig(pc: unknown): IProConfig {
        if (!pc || typeof pc !== 'object' || Array.isArray(pc)) {
            return this.invalidConfig('proConfigs must be an object')
        }

        const candidate = pc as { alerts?: unknown }
        if (
            Object.keys(candidate).some((key) => key !== 'alerts') ||
            !Array.isArray(candidate.alerts)
        ) {
            return this.invalidConfig(
                'proConfigs must contain only an alerts array'
            )
        }

        candidate.alerts.forEach((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                return this.invalidConfig('Each alert must be an object')
            }

            const alert = item as {
                event?: unknown
                action?: unknown
            }
            if (
                Object.keys(alert).some(
                    (key) => key !== 'event' && key !== 'action'
                ) ||
                !alert.action ||
                typeof alert.action !== 'object' ||
                Array.isArray(alert.action)
            ) {
                return this.invalidConfig(
                    'Each alert must contain event and action'
                )
            }

            const action = alert.action as {
                actionType?: unknown
                metadata?: unknown
            }
            if (
                Object.keys(action).some(
                    (key) => key !== 'actionType' && key !== 'metadata'
                )
            ) {
                return this.invalidConfig(
                    'Alert action contains an unknown field'
                )
            }

            if (action.metadata !== undefined) {
                let serializedMetadata: string | undefined
                try {
                    serializedMetadata = JSON.stringify(action.metadata)
                } catch {
                    return this.invalidConfig(
                        'Alert metadata must be valid JSON'
                    )
                }
                if (
                    serializedMetadata !== undefined &&
                    serializedMetadata.length > 16_384
                ) {
                    return this.invalidConfig(
                        'Alert metadata must be smaller than 16 KB'
                    )
                }
            }
        })

        const normalized = this.ensureProConfigType(pc)
        if (normalized.alerts.length !== candidate.alerts.length) {
            return this.invalidConfig(
                'Alerts contain an unsupported event, action, or duplicate channel'
            )
        }

        return normalized
    }

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
