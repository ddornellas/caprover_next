import * as fs from 'fs-extra'
import * as os from 'os'
import path from 'path'
import * as tar from 'tar'

import { safeTarExtractOptions } from '../src/utils/SafeTar'

describe('safe tar extraction integration', () => {
    let root = ''

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'caprover-safe-tar-'))
    })

    afterEach(async () => {
        await fs.remove(root)
    })

    test('extracts a valid archive into the requested directory', async () => {
        const source = path.join(root, 'source')
        const destination = path.join(root, 'destination')
        const archive = path.join(root, 'valid.tar')
        await fs.outputFile(
            path.join(source, 'nested', 'captain-definition'),
            '{}'
        )
        await fs.ensureDir(destination)

        await tar.c({ cwd: source, file: archive }, ['.'])
        await tar.extract({
            cwd: destination,
            file: archive,
            ...safeTarExtractOptions(),
        })

        await expect(
            fs.readFile(
                path.join(destination, 'nested', 'captain-definition'),
                'utf8'
            )
        ).resolves.toBe('{}')
    })
})
