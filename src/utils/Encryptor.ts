import crypto = require('crypto')

/**
 * Content of this file is mostly taken from https://gist.github.com/vlucas/2bd40f62d20c1d49237a109d491974eb
 */

const legacyAlgorithm = 'aes-256-ctr'
const authenticatedAlgorithm = 'aes-256-gcm'
const LEGACY_IV_LENGTH = 16
const AUTHENTICATED_IV_LENGTH = 12
const AUTHENTICATED_TAG_LENGTH = 16
const AUTHENTICATED_PREFIX = 'v2:'

export default class CaptainEncryptor {
    private encryptionKey: string

    constructor(encryptionKey: string) {
        if (!encryptionKey || encryptionKey.length < 32) {
            throw new Error('Encryption Key too short!')
        }

        encryptionKey = crypto
            .createHash('sha256')
            .update(encryptionKey)
            .digest('hex')

        if (!encryptionKey || encryptionKey.length < 32) {
            throw new Error('Encryption Key too short after hashing!')
        }

        this.encryptionKey = encryptionKey.slice(0, 32)
    }

    encrypt(clearText: string) {
        const self = this

        const iv = crypto.randomBytes(AUTHENTICATED_IV_LENGTH)
        const key = Buffer.from(self.encryptionKey)
        const cipher = crypto.createCipheriv(authenticatedAlgorithm, key, iv)
        let encrypted = cipher.update(clearText)

        encrypted = Buffer.concat([encrypted, cipher.final()])
        const authTag = cipher.getAuthTag()

        return `${AUTHENTICATED_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
    }

    decrypt(text: string) {
        const self = this
        text = text + ''

        if (text.startsWith(AUTHENTICATED_PREFIX)) {
            const parts = text.substring(AUTHENTICATED_PREFIX.length).split(':')
            if (parts.length !== 3) throw new Error('Invalid encrypted value')

            const iv = Buffer.from(parts[0], 'hex')
            const authTag = Buffer.from(parts[1], 'hex')
            const encryptedText = Buffer.from(parts[2], 'hex')
            if (
                iv.length !== AUTHENTICATED_IV_LENGTH ||
                authTag.length !== AUTHENTICATED_TAG_LENGTH
            ) {
                throw new Error('Invalid encrypted value')
            }

            const key = Buffer.from(self.encryptionKey)
            const decipher = crypto.createDecipheriv(
                authenticatedAlgorithm,
                key,
                iv
            )
            decipher.setAuthTag(authTag)
            let decrypted = decipher.update(encryptedText)
            decrypted = Buffer.concat([decrypted, decipher.final()])
            return decrypted.toString()
        }

        const textParts = text.split(':')
        const shifted = textParts.shift()
        if (!shifted) throw new Error('text.split failed')

        const iv = Buffer.from(shifted, 'hex')
        if (iv.length !== LEGACY_IV_LENGTH) {
            throw new Error('Invalid legacy encrypted value')
        }
        const encryptedText = Buffer.from(textParts.join(':'), 'hex')
        const key = Buffer.from(self.encryptionKey)
        const decipher = crypto.createDecipheriv(legacyAlgorithm, key, iv)
        let decrypted = decipher.update(encryptedText)

        decrypted = Buffer.concat([decrypted, decipher.final()])

        return decrypted.toString()
    }
}
