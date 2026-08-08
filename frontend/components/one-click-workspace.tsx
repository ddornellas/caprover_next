'use client'

import {
    ArrowLeft,
    CheckCircle2,
    ExternalLink,
    LoaderCircle,
    Plus,
    RefreshCw,
    Rocket,
    Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { parse as parseYaml } from 'yaml'

import { clientApiRequest, CaptainApiError } from '@/lib/api-client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface OneClickIdentifier {
    baseUrl: string
    isOfficial: boolean
    name: string
    displayName: string
    description: string
    logoUrl: string
}

interface DeploymentState {
    steps?: string[]
    error?: string
    successMessage?: string
    currentStep?: number
}

type JsonObject = Record<string, unknown>

interface OneClickWorkspaceProps {
    mode?: 'catalog' | 'app' | 'compose' | 'custom' | 'deployment'
    initialAppName?: string
    initialBaseDomain?: string
    rootDomain?: string
    initialTemplate?: string
    initialValues?: string
    initialTemplateName?: string
}

function getErrorMessage(error: unknown) {
    if (error instanceof CaptainApiError) return error.message
    if (error instanceof Error) return error.message
    return 'The operation could not be completed.'
}

function pretty(value: unknown) {
    return JSON.stringify(value ?? {}, null, 2)
}

function parseStructuredInput(source: string) {
    const input = source.trim()
    if (!input) return undefined

    try {
        return JSON.parse(input) as unknown
    } catch {
        return parseYaml(input) as unknown
    }
}

function parseObjectInput(source: string): JsonObject {
    const parsed = parseStructuredInput(source)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected an object')
    }
    return parsed as JsonObject
}

function valuesFromTemplate(template: JsonObject) {
    const variables = ((template.caproverOneClickApp as JsonObject | undefined)
        ?.variables || []) as Array<JsonObject>
    return variables
        .filter((variable) => variable.id)
        .map((variable) => ({
            key: `${variable.id}`,
            value: `${variable.defaultValue || ''}`,
        }))
}

export function OneClickWorkspace({
    mode = 'catalog',
    initialAppName = '',
    initialBaseDomain = '',
    rootDomain = '',
    initialTemplate,
    initialValues,
    initialTemplateName = '',
}: OneClickWorkspaceProps) {
    const [apps, setApps] = useState<OneClickIdentifier[]>([])
    const [repositories, setRepositories] = useState<string[]>([])
    const [repositoryUrl, setRepositoryUrl] = useState('')
    const [selected, setSelected] = useState<OneClickIdentifier>()
    const [templateText, setTemplateText] = useState(initialTemplate || '')
    const [valuesText, setValuesText] = useState(initialValues || '[]')
    const [appName, setAppName] = useState(initialAppName)
    const [templateName, setTemplateName] = useState(initialTemplateName)
    const [jobId, setJobId] = useState<string>()
    const [deployment, setDeployment] = useState<DeploymentState>()
    const [loading, setLoading] = useState(mode === 'catalog' || mode === 'app')
    const [working, setWorking] = useState(false)
    const [notice, setNotice] = useState<string>()
    const [error, setError] = useState<string>()
    const deploymentStarted = useRef(false)

    const parsedTemplate = useMemo(() => {
        try {
            return parseObjectInput(templateText)
        } catch {
            return undefined
        }
    }, [templateText])

    async function loadCatalog() {
        setLoading(true)
        setError(undefined)
        try {
            const [appsResponse, repositoriesResponse] = await Promise.all([
                clientApiRequest<{ oneClickApps?: OneClickIdentifier[] }>(
                    '/user/oneclick/template/list'
                ),
                clientApiRequest<{ urls?: string[] }>(
                    '/user/oneclick/repositories/'
                ),
            ])
            setApps(appsResponse.data.oneClickApps || [])
            setRepositories(repositoriesResponse.data.urls || [])
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (mode === 'catalog') void loadCatalog()
    }, [mode])

    useEffect(() => {
        if (mode !== 'app' || !initialAppName || !initialBaseDomain) return

        async function loadAppTemplate() {
            setLoading(true)
            try {
                const response = await clientApiRequest<{
                    appTemplate?: JsonObject
                }>(
                    `/user/oneclick/template/app?baseDomain=${encodeURIComponent(initialBaseDomain)}&appName=${encodeURIComponent(initialAppName)}`
                )
                const template = response.data.appTemplate || {}
                setSelected({
                    baseUrl: initialBaseDomain,
                    isOfficial:
                        initialBaseDomain ===
                        'https://oneclickapps.caprover.com',
                    name: initialAppName,
                    displayName: `${initialAppName}`,
                    description: '',
                    logoUrl: '',
                })
                setTemplateText(pretty(template))
                setValuesText(pretty(valuesFromTemplate(template)))
                setTemplateName(
                    initialTemplateName ||
                        (initialBaseDomain ===
                        'https://oneclickapps.caprover.com'
                            ? `OFFICIAL_${initialAppName}`
                            : 'PRIVATE')
                )
            } catch (operationError) {
                setError(getErrorMessage(operationError))
            } finally {
                setLoading(false)
            }
        }

        void loadAppTemplate()
    }, [initialAppName, initialBaseDomain, mode])

    useEffect(() => {
        if (
            mode === 'deployment' &&
            initialTemplate &&
            !jobId &&
            !deploymentStarted.current
        ) {
            deploymentStarted.current = true
            void startDeployment(initialTemplate, initialValues || '[]')
        }
    }, [initialTemplate, initialValues, jobId, mode])

    useEffect(() => {
        if (!jobId) return
        let active = true
        let timer: number | undefined

        async function poll() {
            try {
                const response = await clientApiRequest<DeploymentState>(
                    `/user/oneclick/deploy/progress?jobId=${encodeURIComponent(jobId || '')}`
                )
                if (!active) return
                setDeployment(response.data)
                if (!response.data.error && !response.data.successMessage) {
                    timer = window.setTimeout(() => void poll(), 2000)
                }
            } catch (operationError) {
                if (!active) return
                setError(getErrorMessage(operationError))
                timer = window.setTimeout(() => void poll(), 3000)
            }
        }

        void poll()
        return () => {
            active = false
            if (timer) window.clearTimeout(timer)
        }
    }, [jobId])

    async function selectApp(app: OneClickIdentifier) {
        setWorking(true)
        setError(undefined)
        try {
            const response = await clientApiRequest<{
                appTemplate?: JsonObject
            }>(
                `/user/oneclick/template/app?baseDomain=${encodeURIComponent(app.baseUrl)}&appName=${encodeURIComponent(app.name)}`
            )
            const template = response.data.appTemplate || {}
            setSelected(app)
            setTemplateText(pretty(template))
            setValuesText(pretty(valuesFromTemplate(template)))
            setTemplateName(app.isOfficial ? `OFFICIAL_${app.name}` : 'PRIVATE')
            setAppName('')
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    async function addRepository(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const value = repositoryUrl.trim()
        if (!value) return
        setWorking(true)
        setError(undefined)
        try {
            await clientApiRequest('/user/oneclick/repositories/insert', {
                method: 'POST',
                body: JSON.stringify({ repositoryUrl: value }),
            })
            setRepositoryUrl('')
            setNotice('One-click repository added.')
            await loadCatalog()
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    async function deleteRepository(url: string) {
        if (!window.confirm(`Remove repository ${url}?`)) return
        setWorking(true)
        setError(undefined)
        try {
            await clientApiRequest('/user/oneclick/repositories/delete', {
                method: 'POST',
                body: JSON.stringify({ repositoryUrl: url }),
            })
            setNotice('One-click repository removed.')
            await loadCatalog()
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    async function startDeployment(
        templateSource = templateText,
        valuesSource = valuesText
    ) {
        let template: JsonObject
        let values: unknown
        try {
            template = parseObjectInput(templateSource)
            values = parseStructuredInput(valuesSource)
            if (values === undefined) throw new Error()
            if (!Array.isArray(values)) {
                if (!values || typeof values !== 'object') throw new Error()
                values = Object.entries(values as JsonObject).map(
                    ([key, value]) => ({
                        key,
                        value: `${value}`,
                    })
                )
            }
            if (
                appName &&
                !(values as Array<{ key: string }>).some(
                    (item) => item.key === '$$cap_appname'
                )
            ) {
                ;(values as Array<{ key: string; value: string }>).push({
                    key: '$$cap_appname',
                    value: appName,
                })
            }
            if (
                rootDomain &&
                !(values as Array<{ key: string }>).some(
                    (item) => item.key === '$$cap_root_domain'
                )
            ) {
                ;(values as Array<{ key: string; value: string }>).push({
                    key: '$$cap_root_domain',
                    value: rootDomain,
                })
            }
        } catch {
            setError('Template and values must be valid JSON or YAML.')
            return
        }

        setWorking(true)
        setError(undefined)
        setNotice(undefined)
        try {
            const response = await clientApiRequest<{ jobId?: string }>(
                '/user/oneclick/deploy',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        template,
                        values,
                        templateName: templateName || 'TEMPLATE_ONE_CLICK',
                    }),
                }
            )
            if (!response.data.jobId)
                throw new Error('No deployment job was returned.')
            setJobId(response.data.jobId)
            setDeployment({ steps: ['Queued'], currentStep: 0 })
            setNotice('One-click deployment started.')
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    function prepareCompose(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        try {
            const compose = parseObjectInput(templateText)
            if (!compose.services) throw new Error()
            const template = {
                ...compose,
                captainVersion: 4,
                caproverOneClickApp: {
                    instructions: {
                        start: 'Your app is being deployed. This may take a few minutes.',
                        end: 'Your app is deployed.',
                    },
                    variables: [],
                },
            }
            setTemplateText(pretty(template))
            setValuesText('[]')
            setTemplateName('DOCKER_COMPOSE')
            setNotice(
                'Compose converted to a CapRover one-click template. Review it and deploy.'
            )
        } catch {
            setError(
                'Docker Compose input must be valid JSON or YAML with a services field.'
            )
        }
    }

    const isDeploymentFinished =
        !!deployment?.error || !!deployment?.successMessage

    if (mode === 'deployment' || jobId) {
        return (
            <div className="mx-auto max-w-3xl space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Rocket className="h-5 w-5 text-primary" />
                            One-click deployment
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <p className="text-sm text-muted-foreground">
                            Keep this page open while CapRover applies the
                            template. The progress comes from the existing
                            deployment job registry.
                        </p>
                        <div className="space-y-2">
                            {(deployment?.steps || ['Starting']).map(
                                (step, index) => (
                                    <div
                                        key={`${step}-${index}`}
                                        className={`flex items-center gap-3 rounded-lg border p-3 ${index === (deployment?.currentStep || 0) && !isDeploymentFinished ? 'border-primary bg-primary/5' : ''}`}
                                    >
                                        <span className="flex h-7 w-7 items-center justify-center rounded-full border text-xs">
                                            {index <
                                                (deployment?.currentStep ||
                                                    0) ||
                                            deployment?.successMessage ? (
                                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                            ) : index ===
                                                  (deployment?.currentStep ||
                                                      0) &&
                                              !isDeploymentFinished ? (
                                                <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
                                            ) : (
                                                index + 1
                                            )}
                                        </span>
                                        <span className="text-sm">{step}</span>
                                    </div>
                                )
                            )}
                        </div>
                        {deployment?.error && (
                            <Alert variant="destructive">
                                <AlertTitle>Deployment failed</AlertTitle>
                                <AlertDescription>
                                    {deployment.error}
                                </AlertDescription>
                            </Alert>
                        )}
                        {deployment?.successMessage && (
                            <Alert>
                                <AlertTitle>Deployment completed</AlertTitle>
                                <AlertDescription>
                                    {deployment.successMessage}
                                </AlertDescription>
                            </Alert>
                        )}
                        <div className="flex justify-end">
                            <Link href="/apps">
                                <Button type="button">Back to apps</Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (mode === 'compose' || mode === 'custom') {
        return (
            <div className="space-y-6">
                <div>
                    <Link
                        href="/apps"
                        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" /> Apps
                    </Link>
                    <h1 className="mt-4 text-3xl font-semibold tracking-tight">
                        {mode === 'compose'
                            ? 'Docker Compose'
                            : 'Custom one-click template'}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {mode === 'compose'
                            ? 'Paste a Docker Compose YAML or JSON file. CapRover support is intentionally limited to the fields handled by the existing one-click manager.'
                            : 'Use a v4 one-click template for testing or internal catalogs.'}
                    </p>
                </div>
                {notice && (
                    <Alert>
                        <AlertTitle>Done</AlertTitle>
                        <AlertDescription>{notice}</AlertDescription>
                    </Alert>
                )}
                {error && (
                    <Alert variant="destructive">
                        <AlertTitle>Invalid template</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {mode === 'compose'
                                ? 'Compose YAML or JSON'
                                : 'Template JSON'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form
                            className="space-y-4"
                            onSubmit={
                                mode === 'compose'
                                    ? prepareCompose
                                    : (event) => {
                                          event.preventDefault()
                                          setTemplateName('TEMPLATE_ONE_CLICK')
                                          setValuesText('[]')
                                          setNotice(
                                              'Template loaded. Review the values and deploy below.'
                                          )
                                      }
                            }
                        >
                            <Textarea
                                rows={18}
                                className="font-mono text-xs"
                                value={templateText}
                                onChange={(event) =>
                                    setTemplateText(event.target.value)
                                }
                                placeholder={
                                    mode === 'compose'
                                        ? 'services:\n  web:\n    image: nginx'
                                        : '{"captainVersion":4,"services":{},"caproverOneClickApp":{"variables":[]}}'
                                }
                            />
                            <div className="flex justify-end">
                                <Button type="submit">Continue</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
                {parsedTemplate && (
                    <TemplateEditor
                        templateText={templateText}
                        setTemplateText={setTemplateText}
                        valuesText={valuesText}
                        setValuesText={setValuesText}
                        appName={appName}
                        setAppName={setAppName}
                        templateName={templateName}
                        setTemplateName={setTemplateName}
                        working={working}
                        onDeploy={() => void startDeployment()}
                    />
                )}
            </div>
        )
    }

    if (mode === 'app' && !selected) {
        return (
            <Card>
                <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
                    {loading && (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                    )}
                    {loading
                        ? 'Loading one-click template…'
                        : 'The one-click template could not be loaded.'}
                </CardContent>
            </Card>
        )
    }

    if (selected) {
        return (
            <div className="space-y-6">
                <Button
                    variant="ghost"
                    type="button"
                    onClick={() => setSelected(undefined)}
                >
                    <ArrowLeft className="h-4 w-4" /> Back to catalog
                </Button>
                <div>
                    <Badge>
                        {selected.isOfficial ? 'Official' : 'Community'}
                    </Badge>
                    <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                        {selected.displayName}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {selected.description}
                    </p>
                </div>
                <TemplateEditor
                    templateText={templateText}
                    setTemplateText={setTemplateText}
                    valuesText={valuesText}
                    setValuesText={setValuesText}
                    appName={appName}
                    setAppName={setAppName}
                    templateName={templateName}
                    setTemplateName={setTemplateName}
                    working={working}
                    onDeploy={() => void startDeployment()}
                />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {notice && (
                <Alert>
                    <AlertTitle>Done</AlertTitle>
                    <AlertDescription>{notice}</AlertDescription>
                </Alert>
            )}
            {error && (
                <Alert variant="destructive">
                    <AlertTitle>One-click catalog unavailable</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
                        Application catalog
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                        One-click apps
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Choose an app from the official or configured
                        repositories, then review its variables before
                        deployment.
                    </p>
                </div>
                <Button
                    variant="outline"
                    type="button"
                    disabled={loading}
                    onClick={() => void loadCatalog()}
                >
                    <RefreshCw className={loading ? 'animate-spin' : ''} />{' '}
                    Refresh
                </Button>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Custom repositories</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <form
                        className="flex flex-col gap-2 sm:flex-row"
                        onSubmit={addRepository}
                    >
                        <Input
                            value={repositoryUrl}
                            onChange={(event) =>
                                setRepositoryUrl(event.target.value)
                            }
                            placeholder="https://oneclick-apps.example.com"
                        />
                        <Button type="submit" disabled={working}>
                            <Plus className="h-4 w-4" /> Add repository
                        </Button>
                    </form>
                    {repositories.map((url) => (
                        <div
                            key={url}
                            className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                        >
                            <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate text-primary hover:underline"
                            >
                                {url}
                            </a>
                            <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                onClick={() => void deleteRepository(url)}
                                aria-label={`Delete ${url}`}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </CardContent>
            </Card>
            {loading ? (
                <Card>
                    <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
                        <LoaderCircle className="h-4 w-4 animate-spin" />{' '}
                        Loading one-click apps…
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {apps.map((app) => (
                        <button
                            key={`${app.baseUrl}-${app.name}`}
                            type="button"
                            className="rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary/50 hover:shadow-sm"
                            onClick={() => void selectApp(app)}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <Badge>
                                    {app.isOfficial ? 'Official' : 'Community'}
                                </Badge>
                                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <h2 className="mt-4 text-lg font-semibold">
                                {app.displayName}
                            </h2>
                            <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">
                                {app.description}
                            </p>
                            <p className="mt-4 truncate text-xs text-muted-foreground">
                                {app.baseUrl}
                            </p>
                        </button>
                    ))}
                </div>
            )}
            {!loading && !apps.length && (
                <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        No one-click apps were returned. Check repositories or
                        try again.
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

function TemplateEditor({
    templateText,
    setTemplateText,
    valuesText,
    setValuesText,
    appName,
    setAppName,
    templateName,
    setTemplateName,
    working,
    onDeploy,
}: {
    templateText: string
    setTemplateText: (value: string) => void
    valuesText: string
    setValuesText: (value: string) => void
    appName: string
    setAppName: (value: string) => void
    templateName: string
    setTemplateName: (value: string) => void
    working: boolean
    onDeploy: () => void
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Review and deploy</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Values are sent as key/value pairs to the existing one-click
                    deployment manager.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="oneclick-app-name">
                            App name (optional)
                        </Label>
                        <Input
                            id="oneclick-app-name"
                            value={appName}
                            onChange={(event) => setAppName(event.target.value)}
                            placeholder="my-app"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="oneclick-template-name">
                            Template name
                        </Label>
                        <Input
                            id="oneclick-template-name"
                            value={templateName}
                            onChange={(event) =>
                                setTemplateName(event.target.value)
                            }
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="oneclick-values">Values JSON</Label>
                    <Textarea
                        id="oneclick-values"
                        rows={10}
                        className="font-mono text-xs"
                        value={valuesText}
                        onChange={(event) => setValuesText(event.target.value)}
                        placeholder={
                            '[{"key":"$$cap_version","value":"latest"}]'
                        }
                    />
                </div>
                <details>
                    <summary className="cursor-pointer text-sm font-medium">
                        Template JSON
                    </summary>
                    <Textarea
                        className="mt-3 font-mono text-xs"
                        rows={14}
                        value={templateText}
                        onChange={(event) =>
                            setTemplateText(event.target.value)
                        }
                    />
                </details>
                <div className="flex justify-end">
                    <Button type="button" disabled={working} onClick={onDeploy}>
                        {working && (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                        )}
                        <Rocket className="h-4 w-4" /> Deploy
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
