import { APP_DOMAIN_TYPES } from '../models/AppDefinition'
import type { AppDomainType } from '../models/AppDefinition'

export const DEFAULT_APP_DOMAIN_TYPE: AppDomainType = 'custom'

export function normalizeAppDomainType(value: unknown): AppDomainType {
    if (value === undefined || value === null || value === '') {
        return DEFAULT_APP_DOMAIN_TYPE
    }

    if (typeof value !== 'string') {
        throw new Error(
            'domainType must be one of: internal, external, test, custom'
        )
    }

    const normalizedValue = value.trim().toLowerCase()
    if (!(APP_DOMAIN_TYPES as readonly string[]).includes(normalizedValue)) {
        throw new Error(
            'domainType must be one of: internal, external, test, custom'
        )
    }

    return normalizedValue as AppDomainType
}
