import fs from 'fs'
import path from 'path'

describe('production runtime images', () => {
    it.each(['dockerfile-captain.release', 'dockerfile-captain.edge'])(
        'includes runtime dockerfiles in %s',
        (dockerfileName) => {
            const dockerfile = fs.readFileSync(
                path.join(process.cwd(), dockerfileName),
                'utf8'
            )

            expect(dockerfile).toContain(
                'COPY --from=builder /usr/src/app/dockerfiles ./dockerfiles'
            )
        }
    )
})
