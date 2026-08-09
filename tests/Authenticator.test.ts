import bcrypt = require('bcryptjs')
import Authenticator from '../src/user/Authenticator'

test('Testing Authenticator 1', () => {
    const passwordStored =
        '5EXJbB3Ys4fSg8M7m8FFt8duVvej9oD93SfgXjNNn6EbXG9KU63CZhZbRZ79amRw'
    // const passwordEntered =
    //     '5EXJbB3Ys4fSg8M7m8FFt8duVvej9oD93SfgXjNNnaaaaaaaaaaaaaaaaaaaaaaaaaa6EbXG9KU63CZhZbRZ79amRw'
    const HASH = '2848d8c9-4719-4ad1-bc12-c405a78913c5captain'

    let hashed = bcrypt.hashSync(HASH + passwordStored, bcrypt.genSaltSync(10))

    hashed = '$2a$10$9pEXSGfCSiz/ZC49ucqHuOCiuCy2dK17uqQtXn8BQfx2jt8cYFA9K'

    expect(
        bcrypt.compareSync(
            HASH +
                '5EXJbB3Ys4fSg8M7m8FFt8duVvej9oD93SfgXjNNnaaaaaaaaaaaaaaaaaaaaaaaaaa6EbXG9KU63CZhZbRZ79amRw',
            hashed
        )
    ).toBe(true)
})

test('new password hashes preserve characters beyond bcrypt input limits', async () => {
    const authenticator = new Authenticator('test-salt-', 'captain')
    const oldPassword = 'old-password'
    const savedHash = bcrypt.hashSync(
        'test-salt-captain' + oldPassword,
        bcrypt.genSaltSync(4)
    )
    const longPassword = 'a'.repeat(100) + '-unique-suffix'

    const updatedHash = await authenticator.changepass(
        oldPassword,
        longPassword,
        savedHash
    )

    await expect(
        authenticator.isPasswordCorrect(longPassword, updatedHash)
    ).resolves.toBe(true)
    await expect(
        authenticator.isPasswordCorrect(
            'a'.repeat(100) + '-different-suffix',
            updatedHash
        )
    ).resolves.toBe(false)
})
