'use client'

import { useEffect } from 'react'

interface CapRoverTheme {
    content?: string
    extra?: string
    headEmbed?: string
}

interface ParsedTheme {
    components?: {
        Layout?: Record<string, unknown>
        Menu?: Record<string, unknown>
    }
    token?: Record<string, unknown>
}

const themeHeadAttribute = 'data-caprover-theme-head'
const themeStyleProperties = [
    '--primary',
    '--ring',
    '--background',
    '--card',
    '--accent',
    '--radius',
    '--caprover-font-family',
]

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

/**
 * CapRover themes intentionally use JavaScript expressions because the
 * legacy UI evaluated Ant Design algorithms such as `isDarkMode ? ...`.
 * Keep that persisted format compatible while translating the useful tokens
 * into the CSS variables used by the Next/shadcn UI.
 */
export function parseCapRoverTheme(
    content: string | undefined,
    isDarkMode: boolean
): ParsedTheme | undefined {
    if (!content?.trim()) return undefined

    try {
        const evaluate = new Function(
            'isDarkMode',
            'darkAlgorithm',
            'defaultAlgorithm',
            `return (${content})`
        ) as (
            isDarkMode: boolean,
            darkAlgorithm: undefined,
            defaultAlgorithm: undefined
        ) => unknown

        const parsed = evaluate(isDarkMode, undefined, undefined)
        return isRecord(parsed) ? (parsed as ParsedTheme) : undefined
    } catch {
        return undefined
    }
}

function setStyleProperty(
    root: HTMLElement,
    property: string,
    value: unknown,
    suffix = ''
) {
    if (typeof value === 'string' && value.trim()) {
        root.style.setProperty(property, `${value.trim()}${suffix}`)
    } else if (typeof value === 'number' && Number.isFinite(value)) {
        root.style.setProperty(property, `${value}${suffix}`)
    }
}

function appendThemeHead(headEmbed: string | undefined) {
    document.head
        .querySelectorAll(`[${themeHeadAttribute}]`)
        .forEach((node) => node.remove())

    if (!headEmbed?.trim()) return

    const template = document.createElement('template')
    template.innerHTML = headEmbed

    for (const node of Array.from(template.content.childNodes)) {
        if (node.nodeName.toLowerCase() === 'script') {
            const script = document.createElement('script')
            for (const attribute of Array.from(
                (node as Element).attributes || []
            )) {
                script.setAttribute(attribute.name, attribute.value)
            }
            script.textContent = node.textContent
            script.setAttribute(themeHeadAttribute, '')
            document.head.appendChild(script)
            continue
        }

        const element = node as Element
        if (element.setAttribute) element.setAttribute(themeHeadAttribute, '')
        document.head.appendChild(node)
    }
}

export function applyCapRoverTheme(theme: CapRoverTheme | undefined) {
    const root = document.documentElement
    const parsed = parseCapRoverTheme(
        theme?.content,
        root.classList.contains('dark')
    )
    const token = parsed?.token || {}
    const layout = parsed?.components?.Layout || {}
    const menu = parsed?.components?.Menu || {}

    for (const property of themeStyleProperties) {
        root.style.removeProperty(property)
    }

    setStyleProperty(root, '--primary', token.colorPrimary)
    setStyleProperty(root, '--ring', token.colorPrimary)
    setStyleProperty(root, '--background', token.colorBgLayout)
    setStyleProperty(root, '--background', layout.layoutBg)
    setStyleProperty(root, '--card', layout.headerBg)
    setStyleProperty(root, '--card', menu.itemBg)
    setStyleProperty(root, '--accent', layout.colorPrimaryBg)
    setStyleProperty(root, '--radius', token.borderRadius, 'px')
    setStyleProperty(root, '--caprover-font-family', token.fontFamily)
    appendThemeHead(theme?.headEmbed)
}

async function loadCurrentTheme() {
    try {
        const response = await fetch('/api/caprover/theme/current', {
            cache: 'no-store',
            credentials: 'include',
        })
        if (!response.ok) return

        const payload = (await response.json()) as {
            status?: number
            data?: { theme?: CapRoverTheme }
        }
        if (payload.status === 100) applyCapRoverTheme(payload.data?.theme)
    } catch {
        // A theme is optional; the built-in CSS remains usable if the API is
        // not initialized yet or is temporarily unavailable.
    }
}

export function ThemeRuntime() {
    useEffect(() => {
        void loadCurrentTheme()

        const refresh = () => void loadCurrentTheme()
        window.addEventListener('caprover:theme-changed', refresh)
        return () => {
            window.removeEventListener('caprover:theme-changed', refresh)
            applyCapRoverTheme(undefined)
        }
    }, [])

    return null
}
