import moment from 'moment'
import { AnyError } from '../models/OtherTypes'
import CaptainConstants from './CaptainConstants'

function errorize(error: AnyError) {
    if (!(error instanceof Error)) {
        return new Error(`Wrapped: ${error ? error : 'NULL'}`)
    }

    return error
}

function getTime() {
    return `[36m${moment().format('MMMM Do YYYY, h:mm:ss.SSS a    ')}[0m`
}

function redactLogText(value: string) {
    return value
        .replace(
            /(token|password|secret|api[_-]?key|authorization|ssh[_-]?key)=([^&\s]+)/gi,
            '$1=[REDACTED]'
        )
        .replace(
            /(["']?(?:token|password|secret|api[_-]?key|authorization|ssh[_-]?key)["']?\s*:\s*)(?:"[^"]*"|'[^']*'|[^,}\s]+)/gi,
            '$1[REDACTED]'
        )
        .replace(/(https?:\/\/[^\s/:@]+):([^\s/@]+)@/gi, '$1:[REDACTED]@')
        .replace(
            /-----BEGIN (?:OPENSSH|RSA|EC|DSA) PRIVATE KEY-----[\s\S]*?-----END (?:OPENSSH|RSA|EC|DSA) PRIVATE KEY-----/g,
            '[PRIVATE_KEY_REDACTED]'
        )
}

class Logger {
    static d(msg: string) {
        console.log(getTime() + redactLogText(msg + ''))
    }

    static w(msg: string) {
        console.log(getTime() + redactLogText(msg + ''))
    }

    static dev(msg: string) {
        if (CaptainConstants.isDebug) {
            console.log(`${getTime()}########### ${redactLogText(msg + '')}`)
        }
    }

    static e(msgOrError: AnyError, message?: string) {
        const err = errorize(msgOrError)
        const safeMessage = redactLogText((message || '') + '')
        const safeError = redactLogText(`${err}`)
        const safeStack = redactLogText(err.stack || '')
        console.error(`${getTime() + safeMessage + '\n' + safeError}
${safeStack}`)
    }
}
export default Logger
