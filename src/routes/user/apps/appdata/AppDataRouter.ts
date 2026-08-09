import express = require('express')
import fs from 'fs-extra'
import path from 'path'
import ApiStatusCodes from '../../../../api/ApiStatusCodes'
import BaseApi from '../../../../api/BaseApi'
import { uploadCaptainDefinitionContent as uploadCaptainDefinitionContentHandler } from '../../../../handlers/users/apps/appdata/AppDataHandler'
import InjectionExtractor from '../../../../injection/InjectionExtractor'
import multer = require('multer')
import CaptainConstants from '../../../../utils/CaptainConstants'
import { auditFromRequest } from '../../../../user/AuditLogger'

const TEMP_UPLOAD = path.join(
    CaptainConstants.captainRootDirectoryTemp,
    'uploads'
)
const router = express.Router()
const upload = multer({
    dest: TEMP_UPLOAD,
    limits: {
        fileSize: 100 * 1024 * 1024,
        files: 1,
        fields: 20,
        parts: 25,
    },
})

function uploadSingleSourceFile(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) {
    upload.single('sourceFile')(req, res, (error: unknown) => {
        if (!error) {
            next()
            return
        }

        const uploadedPath = (req.file as Express.Multer.File | undefined)?.path
        if (uploadedPath) void fs.remove(uploadedPath)
        next(error)
    })
}

router.get('/:appName/logs', function (req, res, next) {
    const appName = req.params.appName
    const serviceManager =
        InjectionExtractor.extractUserFromInjected(res).user.serviceManager

    return Promise.resolve()
        .then(function () {
            const encoding = req.query.encoding as string
            return serviceManager.getAppLogs(
                appName,
                encoding ? encoding : 'ascii'
            )
        })
        .then(function (logs) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'App runtime logs are retrieved'
            )
            baseApi.data = { logs }
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.get('/:appName/', function (req, res, next) {
    const appName = req.params.appName
    const serviceManager =
        InjectionExtractor.extractUserFromInjected(res).user.serviceManager

    return Promise.resolve()
        .then(function () {
            return serviceManager.getBuildStatus(appName)
        })
        .then(function (data) {
            const baseApi = new BaseApi(
                ApiStatusCodes.STATUS_OK,
                'App build status retrieved'
            )
            baseApi.data = data
            res.send(baseApi)
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

router.post('/:appName/', function (req, res, next) {
    const dataStore =
        InjectionExtractor.extractUserFromInjected(res).user.dataStore
    const appName = req.params.appName

    return dataStore
        .getAppsDataStore()
        .getAppDefinition(appName)
        .then(function (app) {
            // nothing to do with app, just to make sure that it exists!
            next()
        })
        .catch(ApiStatusCodes.createCatcher(res))
})

// uploadCaptainDefinitionContent
router.post<{ appName: string }>(
    '/:appName/',
    uploadSingleSourceFile,
    function (req, res, next) {
        const dataStore =
            InjectionExtractor.extractUserFromInjected(res).user.dataStore
        const serviceManager =
            InjectionExtractor.extractUserFromInjected(res).user.serviceManager

        const appName = req.params.appName
        const isDetachedBuild = !!req.query.detached
        const captainDefinitionContent = `${req.body.captainDefinitionContent || ''}`
        const gitHash = `${req.body.gitHash || ''}`
        const tarballSourceFilePath: string = req.file ? req.file.path : ''
        let handedOffToBuild = false

        return uploadCaptainDefinitionContentHandler(
            {
                appName,
                isDetachedBuild,
                captainDefinitionContent: captainDefinitionContent || undefined,
                gitHash: gitHash || undefined,
                uploadedTarPathSource: tarballSourceFilePath || undefined,
            },
            serviceManager
        )
            .then(function (result) {
                // ImageMaker owns the archive once scheduling starts,
                // including detached builds. Removing it here races the
                // background build and causes intermittent upload failures.
                handedOffToBuild = true
                void auditFromRequest(
                    dataStore,
                    req,
                    'app.deploy',
                    'success',
                    'root-session',
                    appName,
                    {
                        detached: isDetachedBuild,
                        uploadedArchive: !!tarballSourceFilePath,
                    }
                )
                const status = isDetachedBuild
                    ? ApiStatusCodes.STATUS_OK_DEPLOY_STARTED
                    : ApiStatusCodes.STATUS_OK
                res.send(new BaseApi(status, result.message))
            })
            .catch(async function (error) {
                if (tarballSourceFilePath && !handedOffToBuild) {
                    await fs.remove(tarballSourceFilePath)
                }
                void auditFromRequest(
                    dataStore,
                    req,
                    'app.deploy',
                    'failure',
                    'root-session',
                    appName,
                    {
                        detached: isDetachedBuild,
                        uploadedArchive: !!tarballSourceFilePath,
                    }
                )
                ApiStatusCodes.createCatcher(res)(error)
            })
    }
)

export default router
