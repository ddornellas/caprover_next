import path from 'path'

export function isSafeArchivePath(entryPath: string) {
    if (
        typeof entryPath !== 'string' ||
        !entryPath ||
        entryPath.includes('\0')
    ) {
        return false
    }
    const normalized = path.posix.normalize(entryPath.replace(/\\/g, '/'))
    return (
        !path.posix.isAbsolute(normalized) &&
        normalized !== '..' &&
        !normalized.startsWith('../')
    )
}

export function safeTarExtractOptions() {
    let extractedEntries = 0
    let expandedBytes = 0

    return {
        preservePaths: false,
        strict: true,
        unlink: true,
        maxDecompressionRatio: 100,
        filter: (entryPath: string, entry: any) => {
            if (!isSafeArchivePath(entryPath)) {
                throw new Error(`Unsafe archive path: ${entryPath}`)
            }

            extractedEntries++
            expandedBytes += Number(entry?.size || 0)
            if (
                extractedEntries > 10_000 ||
                expandedBytes > 500 * 1024 * 1024
            ) {
                throw new Error('Archive expands beyond the allowed limit')
            }

            if (
                (entry?.type === 'SymbolicLink' || entry?.type === 'Link') &&
                (!entry.linkpath || !isSafeArchivePath(entry.linkpath))
            ) {
                throw new Error(`Unsafe archive link: ${entry.linkpath || ''}`)
            }

            return true
        },
    }
}
