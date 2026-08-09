import express = require('express')
import path from 'path'
import ApiStatusCodes from '../../api/ApiStatusCodes'
import Authenticator from '../../user/Authenticator'
import CaptainConstants from '../../utils/CaptainConstants'
import Utils from '../../utils/Utils'

const router = express.Router()

router.get('/', function (req, res, next) {
    const downloadToken = req.query.downloadToken as string
    const namespace = req.query.namespace as string

    Promise.resolve() //
        .then(function () {
            if (namespace !== CaptainConstants.rootNameSpace) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED,
                    'Invalid download namespace'
                )
            }
            return Authenticator.getAuthenticator(
                namespace
            ).decodeDownloadToken(downloadToken)
        })
        .then(function (obj) {
            const downloadFileName = path.basename(
                `${obj.downloadFileName || ''}`
            )
            if (
                !downloadFileName ||
                downloadFileName !== obj.downloadFileName
            ) {
                throw ApiStatusCodes.createError(
                    ApiStatusCodes.STATUS_AUTH_TOKEN_INVALID,
                    'Invalid download file'
                )
            }
            const fileFullPath = path.join(
                CaptainConstants.captainDownloadsDirectory,
                namespace,
                downloadFileName
            )
            res.setHeader('Cache-Control', 'no-store')
            res.setHeader('Referrer-Policy', 'no-referrer')
            res.setHeader('X-Content-Type-Options', 'nosniff')
            res.download(fileFullPath, downloadFileName, function () {
                Utils.deleteFileQuietly(fileFullPath)
            })
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

export default router
