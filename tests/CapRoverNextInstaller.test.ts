import fs from 'fs'
import path from 'path'
import { execFileSync, spawnSync } from 'child_process'

const installerPath = path.join(
    process.cwd(),
    'install',
    'caprover-next-install'
)

describe('CapRover Next VM installer', () => {
    it('is a valid bash script and exposes the operator commands', () => {
        expect(() => execFileSync('bash', ['-n', installerPath])).not.toThrow()

        const help = execFileSync('bash', [installerPath, '--help'], {
            encoding: 'utf8',
        })

        expect(help).toContain('install')
        expect(help).toContain('doctor')
        expect(help).toContain('upgrade')
        expect(help).toContain('--image-digest')
    })

    it('rejects unsafe image references before touching the host', () => {
        const result = spawnSync(
            'bash',
            [installerPath, 'install', '--image', 'registry.example/bad image'],
            { encoding: 'utf8' }
        )

        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain('invalid image repository')
    })

    it('requires a complete sha256 image digest', () => {
        const result = spawnSync(
            'bash',
            [installerPath, 'install', '--image-digest', 'sha256:invalid'],
            { encoding: 'utf8' }
        )

        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain('--image-digest must be sha256')
    })

    it('is checked in as an executable artifact', () => {
        const mode = fs.statSync(installerPath).mode
        expect(mode & 0o111).toBeGreaterThan(0)
    })
})
