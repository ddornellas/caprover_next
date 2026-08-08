import { parseCapRoverTheme } from '../frontend/components/theme-runtime'

describe('CapRover theme compatibility', () => {
    it('parses persisted legacy theme expressions', () => {
        const theme = parseCapRoverTheme(
            `{
                token: {
                    colorPrimary: '#008264',
                    borderRadius: 20,
                },
                components: {
                    Layout: { headerBg: '#1a362f' },
                },
            }`,
            false
        )

        expect(theme).toEqual({
            token: {
                colorPrimary: '#008264',
                borderRadius: 20,
            },
            components: {
                Layout: { headerBg: '#1a362f' },
            },
        })
    })

    it('provides the dark-mode context used by existing themes', () => {
        const theme = parseCapRoverTheme(
            `{ token: { colorPrimary: isDarkMode ? '#fff' : '#000' } }`,
            true
        )

        expect(theme?.token?.colorPrimary).toBe('#fff')
    })
})
