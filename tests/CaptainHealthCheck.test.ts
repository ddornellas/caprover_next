import { getCaptainHealthCheckUrl } from '../src/user/system/CaptainManager'

describe('Captain health check URL', () => {
    it('uses HTTPS when SSL is forced', () => {
        expect(
            getCaptainHealthCheckUrl(
                'captain.example.com',
                '/checkhealth',
                true
            )
        ).toBe('https://captain.example.com/checkhealth')
    })

    it('keeps HTTP when SSL is not forced', () => {
        expect(
            getCaptainHealthCheckUrl(
                'captain.example.com',
                '/checkhealth',
                false
            )
        ).toBe('http://captain.example.com/checkhealth')
    })
})
