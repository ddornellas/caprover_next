import ProManagerUtils from '../src/user/pro/ProManagerUtils'

describe('ProManagerUtils', () => {
    it('keeps supported alert channels and metadata', () => {
        expect(
            ProManagerUtils.ensureProConfigType({
                alerts: [
                    {
                        event: 'UserLoggedIn',
                        action: { actionType: 'email' },
                    },
                    {
                        event: 'AppBuildFailed',
                        action: {
                            actionType: 'webhook',
                            metadata: { url: 'https://example.test/hooks' },
                        },
                    },
                ],
            })
        ).toEqual({
            alerts: [
                {
                    event: 'UserLoggedIn',
                    action: { actionType: 'email', metadata: undefined },
                },
                {
                    event: 'AppBuildFailed',
                    action: {
                        actionType: 'webhook',
                        metadata: { url: 'https://example.test/hooks' },
                    },
                },
            ],
        })
    })

    it('ignores malformed, unsupported, and duplicate alerts', () => {
        expect(
            ProManagerUtils.ensureProConfigType({
                alerts: [
                    null,
                    'not-an-alert',
                    { event: 'UserLoggedIn' },
                    { event: 'UnknownEvent', action: { actionType: 'email' } },
                    {
                        event: 'UserLoggedIn',
                        action: { actionType: 'sms' },
                    },
                    {
                        event: ' UserLoggedIn ',
                        action: { actionType: 'email' },
                    },
                    {
                        event: 'AppBuildSuccessful',
                        action: { actionType: 'webhook' },
                    },
                ],
            })
        ).toEqual({
            alerts: [
                {
                    event: 'UserLoggedIn',
                    action: { actionType: 'email', metadata: undefined },
                },
                {
                    event: 'AppBuildSuccessful',
                    action: { actionType: 'webhook', metadata: undefined },
                },
            ],
        })
    })
})
