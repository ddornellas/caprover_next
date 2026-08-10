import configstore = require('configstore')
import { v4 as uuid } from 'uuid'
import { IProConfig } from '../models/IProFeatures'
import ProManagerUtils from '../user/pro/ProManagerUtils'
import CaptainEncryptor from '../utils/Encryptor'

const IS_OTP_ENABLED = 'isOtpEnabled'
const PRO_API_KEY = 'proApiKey'
const PRO_CONFIGS = 'proConfigs'
const INSTALLATION_ID = 'installationId'

const PRO_PREFIX = 'pro'

function getDataKey(key: string) {
    return PRO_PREFIX + '.' + key
}

class ProDataStore {
    private encryptor?: CaptainEncryptor

    constructor(private data: configstore) {}

    setEncryptor(encryptor: CaptainEncryptor) {
        this.encryptor = encryptor
    }

    isOtpEnabled(): Promise<boolean> {
        const self = this
        return Promise.resolve().then(function () {
            return !!self.data.get(getDataKey(IS_OTP_ENABLED))
        })
    }

    setOtpEnabled(isEnabled: boolean) {
        const self = this
        return Promise.resolve().then(function () {
            return self.data.set(getDataKey(IS_OTP_ENABLED), !!isEnabled)
        })
    }

    getApiKey() {
        const self = this
        return Promise.resolve().then(function () {
            const stored = `${self.data.get(getDataKey(PRO_API_KEY)) || ''}`
            if (!stored) return ''
            if (!self.encryptor) return stored.startsWith('v2:') ? '' : stored

            if (!stored.startsWith('v2:')) {
                self.data.set(
                    getDataKey(PRO_API_KEY),
                    self.encryptor.encrypt(stored)
                )
                return stored
            }

            try {
                return self.encryptor.decrypt(stored)
            } catch {
                return ''
            }
        })
    }

    getInstallationId() {
        const self = this
        return Promise.resolve()
            .then(function () {
                return `${self.data.get(getDataKey(INSTALLATION_ID)) || ''}`
            })
            .then(function (installationId) {
                if (installationId) return installationId

                const newId = uuid()
                self.data.set(getDataKey(INSTALLATION_ID), newId)
                return newId
            })
    }

    clearAllProConfigs() {
        const self = this
        return Promise.resolve().then(function () {
            const installationId = self.data.get(getDataKey(INSTALLATION_ID))
            self.data.delete(PRO_PREFIX)
            if (installationId) {
                self.data.set(getDataKey(INSTALLATION_ID), installationId)
            }
        })
    }

    setApiKey(apiKey: string) {
        const self = this
        return Promise.resolve().then(function () {
            const value = `${apiKey}`
            return self.data.set(
                getDataKey(PRO_API_KEY),
                self.encryptor ? self.encryptor.encrypt(value) : value
            )
        })
    }

    getConfig(): Promise<IProConfig> {
        const self = this
        return Promise.resolve()
            .then(function () {
                return self.data.get(getDataKey(PRO_CONFIGS))
            })
            .then(function (pc) {
                return ProManagerUtils.ensureProConfigType(pc)
            })
    }

    updateConfig(proConfig: IProConfig): Promise<void> {
        const self = this
        return Promise.resolve().then(function () {
            return self.data.set(getDataKey(PRO_CONFIGS), proConfig)
        })
    }
}

export default ProDataStore
