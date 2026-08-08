'use client'

import { useEffect, useState } from 'react'

import { Select } from '@/components/ui/select'

export const localeOptions = [
    { value: 'en-US', label: 'English', rtl: false },
    { value: 'pt-BR', label: 'Português', rtl: false },
    { value: 'zh-CN', label: '简体中文', rtl: false },
    { value: 'es-ES', label: 'Español', rtl: false },
    { value: 'ko-KR', label: '한국어', rtl: false },
    { value: 'de-DE', label: 'Deutsch', rtl: false },
    { value: 'id-ID', label: 'Bahasa Indonesia', rtl: false },
    { value: 'fr-FR', label: 'Français', rtl: false },
    { value: 'ja-JP', label: '日本語', rtl: false },
    { value: 'hr-HR', label: 'Hrvatski', rtl: false },
    { value: 'nl-NL', label: 'Nederlands', rtl: false },
    { value: 'sv-SE', label: 'Svenska', rtl: false },
    { value: 'fa-IR', label: 'فارسی', rtl: true },
    { value: 'ar-EG', label: 'العربية', rtl: true },
    { value: 'tr-TR', label: 'Türkçe', rtl: false },
    { value: 'ru-RU', label: 'Русский', rtl: false },
] as const

const localeStorageKey = 'caprover-language'

const translations: Record<string, Record<string, string>> = {
    'pt-BR': {
        Overview: 'Visão geral',
        Apps: 'Aplicações',
        Monitoring: 'Monitorização',
        Cluster: 'Cluster',
        Maintenance: 'Manutenção',
        Settings: 'Definições',
        Documentation: 'Documentação',
        'Sign out': 'Sair',
        'Control plane': 'Plano de controlo',
        'TLS certificate active': 'Certificado TLS ativo',
        'TLS certificate not active': 'Certificado TLS inativo',
        'HTTPS enforced': 'HTTPS obrigatório',
        'HTTP and HTTPS available': 'HTTP e HTTPS disponíveis',
        'Migration status': 'Estado da migração',
        Language: 'Idioma',
        'The preference is stored locally and RTL layout is enabled for Arabic and Persian.':
            'A preferência é guardada localmente e o layout RTL é ativado para árabe e persa.',
        'Use light theme': 'Usar tema claro',
        'Use dark theme': 'Usar tema escuro',
    },
}

export function translate(value: string, locale = 'en-US') {
    return translations[locale]?.[value] || value
}

export function useLocale() {
    const [locale, setLocale] = useState('en-US')

    useEffect(() => {
        const stored = window.localStorage.getItem(localeStorageKey)
        if (stored) setLocale(stored)

        const handleChange = () => {
            setLocale(window.localStorage.getItem(localeStorageKey) || 'en-US')
        }
        window.addEventListener('caprover:locale-changed', handleChange)
        return () =>
            window.removeEventListener('caprover:locale-changed', handleChange)
    }, [])

    return locale
}

export function applyLocale(value: string) {
    const option =
        localeOptions.find((item) => item.value === value) || localeOptions[0]
    document.documentElement.lang = option.value
    document.documentElement.dir = option.rtl ? 'rtl' : 'ltr'
    document.cookie = `${localeStorageKey}=${encodeURIComponent(option.value)}; Path=/; SameSite=Lax; Max-Age=31536000`
    return option.value
}

export function LocalePreferences() {
    const locale = useLocale()
    const [, setSelectedLocale] = useState('en-US')

    useEffect(() => {
        const stored = window.localStorage.getItem(localeStorageKey) || 'en-US'
        setSelectedLocale(applyLocale(stored))
    }, [])

    return (
        <div className="space-y-2">
            <p className="text-sm font-medium">
                {translate('Language', locale)}
            </p>
            <Select
                value={locale}
                onChange={(event) => {
                    const next = applyLocale(event.target.value)
                    window.localStorage.setItem(localeStorageKey, next)
                    setSelectedLocale(next)
                    window.dispatchEvent(
                        new CustomEvent('caprover:locale-changed')
                    )
                }}
            >
                {localeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </Select>
            <p className="text-xs text-muted-foreground">
                {translate(
                    'The preference is stored locally and RTL layout is enabled for Arabic and Persian.',
                    locale
                )}
            </p>
        </div>
    )
}
