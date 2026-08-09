'use client'

import {
    CheckCircle2,
    Globe2,
    LoaderCircle,
    Plus,
    Save,
    Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { clientApiRequest, CaptainApiError } from '@/lib/api-client'
import type { SystemInfo } from '@/lib/caprover-api'

import { LocalePreferences } from '@/components/locale-preferences'
import { AgentAccessWorkspace } from '@/components/agent-access-workspace'
import { ThemeToggle } from '@/components/theme-toggle'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface Theme {
    name: string
    content: string
    extra?: string
    headEmbed?: string
    builtIn?: boolean
}

interface NginxConfig {
    baseConfig: { byDefault?: string; customValue?: string }
    captainConfig: { byDefault?: string; customValue?: string }
}

interface OtpState {
    isEnabled?: boolean
    otpPath?: string
}

interface ProFeaturesState {
    isFeatureFlagEnabled: boolean
    isSubscribed: boolean
}

interface ProAlert {
    event: 'UserLoggedIn' | 'AppBuildSuccessful' | 'AppBuildFailed'
    action: { actionType: 'email' | 'webhook'; metadata?: unknown }
}

interface ProConfig {
    alerts: ProAlert[]
}

const proAlertOptions: Array<{
    event: ProAlert['event']
    label: string
    description: string
}> = [
    {
        event: 'UserLoggedIn',
        label: 'Login alerts',
        description: 'Get notified when someone logs in.',
    },
    {
        event: 'AppBuildSuccessful',
        label: 'Successful build alerts',
        description: 'Get notified when an app build succeeds.',
    },
    {
        event: 'AppBuildFailed',
        label: 'Failed build alerts',
        description: 'Get notified when an app build fails.',
    },
]

function getErrorMessage(error: unknown) {
    if (error instanceof CaptainApiError) return error.message
    if (error instanceof Error) return error.message
    return 'The operation could not be completed.'
}

export function SettingsWorkspace({
    initialInfo,
}: {
    initialInfo: SystemInfo
}) {
    const [info, setInfo] = useState(initialInfo)
    const [rootDomain, setRootDomain] = useState(initialInfo.rootDomain)
    const [sslEmail, setSslEmail] = useState('')
    const [oldPassword, setOldPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [nginx, setNginx] = useState<NginxConfig>()
    const [themes, setThemes] = useState<Theme[]>([])
    const [currentTheme, setCurrentTheme] = useState<Theme>()
    const [themeEditor, setThemeEditor] = useState<
        { oldName: string; theme: Theme } | undefined
    >()
    const [otp, setOtp] = useState<OtpState>()
    const [otpToken, setOtpToken] = useState('')
    const [proFeatures, setProFeatures] = useState<ProFeaturesState>()
    const [proConfig, setProConfig] = useState<ProConfig>()
    const [proApiKey, setProApiKey] = useState('')
    const [loading, setLoading] = useState(true)
    const [working, setWorking] = useState(false)
    const [notice, setNotice] = useState<string>()
    const [error, setError] = useState<string>()

    async function loadSettings() {
        setLoading(true)
        try {
            const results = await Promise.allSettled([
                clientApiRequest<NginxConfig>('/user/system/nginxconfig/'),
                clientApiRequest<{ themes?: Theme[] }>(
                    '/user/system/themes/all/'
                ),
                clientApiRequest<{ theme?: Theme }>('/theme/current'),
                clientApiRequest<OtpState>('/user/pro/otp/'),
                clientApiRequest<{ proFeaturesState?: ProFeaturesState }>(
                    '/user/pro/state/'
                ),
                clientApiRequest<{ proConfigs?: ProConfig }>(
                    '/user/pro/configs/'
                ),
            ])

            const [
                nginxResult,
                themesResult,
                currentResult,
                otpResult,
                proFeaturesResult,
                proConfigResult,
            ] = results
            if (nginxResult.status === 'fulfilled') {
                setNginx(nginxResult.value.data)
            }
            if (themesResult.status === 'fulfilled') {
                setThemes(themesResult.value.data.themes || [])
            }
            if (currentResult.status === 'fulfilled') {
                setCurrentTheme(currentResult.value.data.theme)
            }
            if (otpResult.status === 'fulfilled') {
                setOtp(otpResult.value.data)
            }
            if (proFeaturesResult.status === 'fulfilled') {
                setProFeatures(proFeaturesResult.value.data.proFeaturesState)
            }
            if (proConfigResult.status === 'fulfilled') {
                setProConfig(proConfigResult.value.data.proConfigs)
            }

            const firstFailure = results.find(
                (result): result is PromiseRejectedResult =>
                    result.status === 'rejected'
            )
            if (firstFailure) setError(getErrorMessage(firstFailure.reason))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadSettings()
    }, [])

    async function run(
        operation: () => Promise<void>,
        message: string,
        reload = false
    ) {
        setWorking(true)
        setError(undefined)
        try {
            await operation()
            setNotice(message)
            if (reload) window.setTimeout(() => window.location.reload(), 700)
        } catch (operationError) {
            setError(getErrorMessage(operationError))
        } finally {
            setWorking(false)
        }
    }

    function saveDomain(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        return run(
            async () => {
                await clientApiRequest('/user/system/changerootdomain/', {
                    method: 'POST',
                    body: JSON.stringify({ rootDomain: rootDomain.trim() }),
                })
            },
            'Root domain saved.',
            true
        )
    }

    function enableSsl(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        return run(
            async () => {
                await clientApiRequest('/user/system/enablessl/', {
                    method: 'POST',
                    body: JSON.stringify({ emailAddress: sslEmail.trim() }),
                })
            },
            'Root SSL provisioning started.',
            true
        )
    }

    function toggleForceSsl() {
        return run(
            async () => {
                await clientApiRequest('/user/system/forcessl/', {
                    method: 'POST',
                    body: JSON.stringify({ isEnabled: !info.forceSsl }),
                })
                setInfo({ ...info, forceSsl: !info.forceSsl })
            },
            `Non-SSL traffic is now ${info.forceSsl ? 'allowed' : 'rejected'}.`
        )
    }

    function changePassword(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!newPassword || newPassword !== confirmPassword) {
            setError('New passwords must be present and match.')
            return
        }
        return run(async () => {
            await clientApiRequest('/user/changepassword/', {
                method: 'POST',
                body: JSON.stringify({ oldPassword, newPassword }),
            })
            setOldPassword('')
            setNewPassword('')
            setConfirmPassword('')
        }, 'Password changed successfully.')
    }

    function saveNginx() {
        if (!nginx) return
        return run(async () => {
            await clientApiRequest('/user/system/nginxconfig/', {
                method: 'POST',
                body: JSON.stringify({
                    baseConfig: {
                        customValue: nginx.baseConfig.customValue || '',
                    },
                    captainConfig: {
                        customValue: nginx.captainConfig.customValue || '',
                    },
                }),
            })
        }, 'NGINX configuration saved and applied.')
    }

    async function selectTheme(name: string) {
        await run(
            async () => {
                await clientApiRequest('/user/system/themes/setcurrent/', {
                    method: 'POST',
                    body: JSON.stringify({ themeName: name }),
                })
                setCurrentTheme(themes.find((theme) => theme.name === name))
                window.dispatchEvent(new CustomEvent('caprover:theme-changed'))
            },
            name ? 'Theme selected.' : 'Default theme selected.'
        )
    }

    async function saveTheme(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!themeEditor) return
        await run(async () => {
            await clientApiRequest('/user/system/themes/update/', {
                method: 'POST',
                body: JSON.stringify({
                    oldName: themeEditor.oldName,
                    ...themeEditor.theme,
                    builtIn: undefined,
                }),
            })
            setThemeEditor(undefined)
            await loadSettings()
            window.dispatchEvent(new CustomEvent('caprover:theme-changed'))
        }, 'Theme saved and selected.')
    }

    async function deleteTheme() {
        if (!currentTheme || currentTheme.builtIn) return
        if (!window.confirm(`Delete theme ${currentTheme.name}?`)) return
        await run(async () => {
            await clientApiRequest('/user/system/themes/delete/', {
                method: 'POST',
                body: JSON.stringify({ themeName: currentTheme.name }),
            })
            await loadSettings()
            window.dispatchEvent(new CustomEvent('caprover:theme-changed'))
        }, 'Theme deleted.')
    }

    async function updateOtp(enabled: boolean) {
        await run(
            async () => {
                const response = await clientApiRequest<OtpState>(
                    '/user/pro/otp/',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            enabled,
                            token: enabled ? otpToken : '',
                        }),
                    }
                )
                setOtp(response.data)
                if (!response.data.otpPath) setOtpToken('')
            },
            enabled
                ? 'Two-factor authentication updated.'
                : 'Two-factor authentication disabled.'
        )
    }

    function toggleProAlert(event: ProAlert['event'], enabled: boolean) {
        setProConfig((current) => {
            if (!current) return current
            const alerts = current.alerts.filter(
                (alert) =>
                    !(
                        alert.event === event &&
                        alert.action.actionType === 'email'
                    )
            )
            if (enabled) {
                alerts.push({ event, action: { actionType: 'email' } })
            }
            return { ...current, alerts }
        })
    }

    function saveProConfig() {
        if (!proConfig) return
        return run(async () => {
            await clientApiRequest('/user/pro/configs/', {
                method: 'POST',
                body: JSON.stringify({ proConfigs: proConfig }),
            })
        }, 'CapRover PRO alerts saved.')
    }

    function connectProApiKey() {
        const apiKey = proApiKey.trim()
        if (!apiKey) {
            setError('Enter a CapRover PRO API key.')
            return
        }

        return run(async () => {
            await clientApiRequest('/user/pro/apikey/', {
                method: 'POST',
                body: JSON.stringify({ apiKey }),
            })
            setProApiKey('')
            await loadSettings()
        }, 'CapRover PRO API key connected.')
    }

    if (loading && !nginx && !themes.length && !otp) {
        return (
            <Card>
                <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Loading settings…
                </CardContent>
            </Card>
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
                    <AlertTitle>Settings operation failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
                    Control plane
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                    Settings
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Manage domains, TLS, authentication, themes, language, and
                    the NGINX customization hooks already supported by CapRover.
                </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe2 className="h-5 w-5 text-primary" />
                            Domain and TLS
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <form className="space-y-3" onSubmit={saveDomain}>
                            <Label htmlFor="root-domain">Root domain</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="root-domain"
                                    value={rootDomain}
                                    onChange={(event) =>
                                        setRootDomain(event.target.value)
                                    }
                                    placeholder="example.com"
                                    required
                                />
                                <Button type="submit" disabled={working}>
                                    Save
                                </Button>
                            </div>
                        </form>
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge
                                className={
                                    info.hasRootSsl
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                        : ''
                                }
                            >
                                {info.hasRootSsl
                                    ? 'Root SSL active'
                                    : 'Root SSL inactive'}
                            </Badge>
                            <Badge>
                                {info.forceSsl
                                    ? 'HTTPS enforced'
                                    : 'HTTP allowed'}
                            </Badge>
                        </div>
                        {!info.hasRootSsl && (
                            <form className="space-y-3" onSubmit={enableSsl}>
                                <Label htmlFor="ssl-email">
                                    Email for Let&apos;s Encrypt
                                </Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="ssl-email"
                                        type="email"
                                        value={sslEmail}
                                        onChange={(event) =>
                                            setSslEmail(event.target.value)
                                        }
                                        required
                                        placeholder="admin@example.com"
                                    />
                                    <Button type="submit" disabled={working}>
                                        Enable SSL
                                    </Button>
                                </div>
                            </form>
                        )}
                        <Button
                            variant="outline"
                            type="button"
                            disabled={working}
                            onClick={() => void toggleForceSsl()}
                        >
                            {info.forceSsl
                                ? 'Allow non-SSL traffic'
                                : 'Force HTTPS traffic'}
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Appearance and language</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <LocalePreferences />
                        <div className="flex items-center justify-between rounded-lg border p-3">
                            <div>
                                <p className="font-medium">Color mode</p>
                                <p className="text-sm text-muted-foreground">
                                    Follow the system or choose light/dark mode.
                                </p>
                            </div>
                            <ThemeToggle />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Change password</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form className="space-y-4" onSubmit={changePassword}>
                            <PasswordField
                                id="old-password"
                                label="Current password"
                                value={oldPassword}
                                onChange={setOldPassword}
                            />
                            <PasswordField
                                id="new-password"
                                label="New password"
                                value={newPassword}
                                onChange={setNewPassword}
                            />
                            <PasswordField
                                id="confirm-password"
                                label="Confirm new password"
                                value={confirmPassword}
                                onChange={setConfirmPassword}
                            />
                            <div className="flex justify-end">
                                <Button type="submit" disabled={working}>
                                    Change password
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                            Two-factor authentication
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Badge>
                                {otp?.isEnabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                            {otp?.isEnabled && (
                                <span className="text-sm text-muted-foreground">
                                    OTP protects future logins.
                                </span>
                            )}
                        </div>
                        {otp?.otpPath && (
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    Scan or copy this provisioning URI into your
                                    authenticator, then enter the six-digit
                                    code.
                                </p>
                                <Textarea
                                    readOnly
                                    value={otp.otpPath}
                                    rows={3}
                                    className="font-mono text-xs"
                                />
                                <Input
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    value={otpToken}
                                    onChange={(event) =>
                                        setOtpToken(
                                            event.target.value.slice(0, 6)
                                        )
                                    }
                                    placeholder="123456"
                                />
                            </div>
                        )}
                        <div className="flex justify-end gap-2">
                            <Button
                                variant={
                                    otp?.isEnabled ? 'destructive' : 'default'
                                }
                                type="button"
                                disabled={working}
                                onClick={() => void updateOtp(!!otp?.isEnabled)}
                            >
                                {otp?.isEnabled
                                    ? 'Disable 2FA'
                                    : otp?.otpPath
                                      ? 'Confirm 2FA'
                                      : 'Start 2FA setup'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <ThemeSettings
                themes={themes}
                currentTheme={currentTheme}
                editor={themeEditor}
                setEditor={setThemeEditor}
                onSelect={(name) => void selectTheme(name)}
                onEdit={() => {
                    if (!currentTheme) return
                    const name = currentTheme.builtIn
                        ? `${currentTheme.name}-edited`
                        : currentTheme.name
                    setThemeEditor({
                        oldName: currentTheme.builtIn ? '' : currentTheme.name,
                        theme: { ...currentTheme, name },
                    })
                }}
                onDelete={() => void deleteTheme()}
                onSave={(event) => void saveTheme(event)}
            />

            {nginx && (
                <NginxSettings
                    nginx={nginx}
                    setNginx={setNginx}
                    onSave={() => void saveNginx()}
                    disabled={working}
                />
            )}

            {proFeatures?.isFeatureFlagEnabled && (
                <ProSettings
                    features={proFeatures}
                    config={proConfig}
                    apiKey={proApiKey}
                    setApiKey={setProApiKey}
                    onConnectApiKey={() => void connectProApiKey()}
                    onToggleAlert={toggleProAlert}
                    onSaveConfig={() => void saveProConfig()}
                    disabled={working}
                />
            )}

            <AgentAccessWorkspace />
        </div>
    )
}

function PasswordField({
    id,
    label,
    value,
    onChange,
}: {
    id: string
    label: string
    value: string
    onChange: (value: string) => void
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type="password"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                maxLength={29}
                required
            />
        </div>
    )
}

function ThemeSettings({
    themes,
    currentTheme,
    editor,
    setEditor,
    onSelect,
    onEdit,
    onDelete,
    onSave,
}: {
    themes: Theme[]
    currentTheme?: Theme
    editor?: { oldName: string; theme: Theme }
    setEditor: (value: { oldName: string; theme: Theme } | undefined) => void
    onSelect: (name: string) => void
    onEdit: () => void
    onDelete: () => void
    onSave: (event: React.FormEvent<HTMLFormElement>) => void
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Custom themes</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Built-in themes remain protected. Custom theme content is
                    stored through the existing ThemeManager API.
                </p>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="flex flex-wrap gap-2">
                    <Select
                        value={currentTheme?.name || ''}
                        onChange={(event) => onSelect(event.target.value)}
                        className="max-w-xs"
                    >
                        <option value="">Default theme</option>
                        {themes.map((theme) => (
                            <option key={theme.name} value={theme.name}>
                                {theme.name}
                                {theme.builtIn ? ' (built-in)' : ''}
                            </option>
                        ))}
                    </Select>
                    <Button
                        variant="outline"
                        type="button"
                        disabled={!currentTheme}
                        onClick={onEdit}
                    >
                        Edit selected
                    </Button>
                    <Button
                        variant="ghost"
                        type="button"
                        disabled={!currentTheme || currentTheme.builtIn}
                        onClick={onDelete}
                    >
                        <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() =>
                            setEditor({
                                oldName: '',
                                theme: {
                                    name: '',
                                    content: '',
                                    extra: '',
                                    headEmbed: '',
                                },
                            })
                        }
                    >
                        <Plus className="h-4 w-4" /> New theme
                    </Button>
                </div>
                {editor && (
                    <form
                        className="space-y-4 rounded-lg border p-4"
                        onSubmit={onSave}
                    >
                        <div className="space-y-2">
                            <Label htmlFor="theme-name">Name</Label>
                            <Input
                                id="theme-name"
                                value={editor.theme.name}
                                onChange={(event) =>
                                    setEditor({
                                        ...editor,
                                        theme: {
                                            ...editor.theme,
                                            name: event.target.value,
                                        },
                                    })
                                }
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="theme-content">Theme content</Label>
                            <Textarea
                                id="theme-content"
                                rows={10}
                                value={editor.theme.content}
                                onChange={(event) =>
                                    setEditor({
                                        ...editor,
                                        theme: {
                                            ...editor.theme,
                                            content: event.target.value,
                                        },
                                    })
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="theme-head">Head embed</Label>
                            <Textarea
                                id="theme-head"
                                rows={4}
                                value={editor.theme.headEmbed || ''}
                                onChange={(event) =>
                                    setEditor({
                                        ...editor,
                                        theme: {
                                            ...editor.theme,
                                            headEmbed: event.target.value,
                                        },
                                    })
                                }
                                placeholder="<link … />"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="theme-extra">
                                Extra configuration
                            </Label>
                            <Textarea
                                id="theme-extra"
                                rows={5}
                                value={editor.theme.extra || ''}
                                onChange={(event) =>
                                    setEditor({
                                        ...editor,
                                        theme: {
                                            ...editor.theme,
                                            extra: event.target.value,
                                        },
                                    })
                                }
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="ghost"
                                type="button"
                                onClick={() => setEditor(undefined)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit">
                                <Save className="h-4 w-4" /> Save theme
                            </Button>
                        </div>
                    </form>
                )}
            </CardContent>
        </Card>
    )
}

function NginxSettings({
    nginx,
    setNginx,
    onSave,
    disabled,
}: {
    nginx: NginxConfig
    setNginx: (value: NginxConfig) => void
    onSave: () => void
    disabled: boolean
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>NGINX configurations</CardTitle>
                <p className="text-sm text-muted-foreground">
                    These are server-side EJS templates. Keep the template
                    markers intact unless you intentionally need to customize
                    them.
                </p>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="space-y-2">
                    <Label htmlFor="base-nginx">
                        Base config (/etc/nginx/nginx.conf)
                    </Label>
                    <Textarea
                        id="base-nginx"
                        rows={12}
                        value={nginx.baseConfig.customValue || ''}
                        onChange={(event) =>
                            setNginx({
                                ...nginx,
                                baseConfig: {
                                    ...nginx.baseConfig,
                                    customValue: event.target.value,
                                },
                            })
                        }
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="captain-nginx">
                        Captain config (/etc/nginx/conf.d/captain-root.conf)
                    </Label>
                    <Textarea
                        id="captain-nginx"
                        rows={12}
                        value={nginx.captainConfig.customValue || ''}
                        onChange={(event) =>
                            setNginx({
                                ...nginx,
                                captainConfig: {
                                    ...nginx.captainConfig,
                                    customValue: event.target.value,
                                },
                            })
                        }
                    />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() =>
                            setNginx({
                                ...nginx,
                                baseConfig: {
                                    ...nginx.baseConfig,
                                    customValue:
                                        nginx.baseConfig.byDefault || '',
                                },
                                captainConfig: {
                                    ...nginx.captainConfig,
                                    customValue:
                                        nginx.captainConfig.byDefault || '',
                                },
                            })
                        }
                    >
                        Load defaults
                    </Button>
                    <Button type="button" disabled={disabled} onClick={onSave}>
                        <Save className="h-4 w-4" /> Save and update
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

function ProSettings({
    features,
    config,
    apiKey,
    setApiKey,
    onConnectApiKey,
    onToggleAlert,
    onSaveConfig,
    disabled,
}: {
    features: ProFeaturesState
    config?: ProConfig
    apiKey: string
    setApiKey: (value: string) => void
    onConnectApiKey: () => void
    onToggleAlert: (event: ProAlert['event'], enabled: boolean) => void
    onSaveConfig: () => void
    disabled: boolean
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>CapRover PRO</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Configure the existing PRO API integration and alerts.
                </p>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge>
                        {features.isSubscribed ? 'Connected' : 'Not connected'}
                    </Badge>
                    <a
                        href="https://pro.caprover.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary hover:underline"
                    >
                        Get a PRO API key
                    </a>
                </div>
                {!features.isSubscribed && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                            type="password"
                            value={apiKey}
                            onChange={(event) => setApiKey(event.target.value)}
                            placeholder="pro_api_key"
                            autoComplete="off"
                        />
                        <Button
                            type="button"
                            disabled={disabled || !apiKey.trim()}
                            onClick={onConnectApiKey}
                        >
                            Connect key
                        </Button>
                    </div>
                )}
                {features.isSubscribed && config && (
                    <div className="space-y-3">
                        {proAlertOptions.map((option) => {
                            const enabled = config.alerts.some(
                                (alert) =>
                                    alert.event === option.event &&
                                    alert.action.actionType === 'email'
                            )
                            return (
                                <label
                                    key={option.event}
                                    className="flex items-start gap-3 rounded-lg border p-3"
                                >
                                    <input
                                        type="checkbox"
                                        checked={enabled}
                                        onChange={(event) =>
                                            onToggleAlert(
                                                option.event,
                                                event.target.checked
                                            )
                                        }
                                    />
                                    <span>
                                        <span className="block text-sm font-medium">
                                            {option.label}
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                            {option.description}
                                        </span>
                                    </span>
                                </label>
                            )
                        })}
                        <div className="flex justify-end">
                            <Button
                                type="button"
                                disabled={disabled}
                                onClick={onSaveConfig}
                            >
                                Save PRO alerts
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
