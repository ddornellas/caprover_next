import * as childProcess from 'child_process'
import * as fs from 'fs-extra'
import * as path from 'path'
import git from 'simple-git'
import * as uuid from 'uuid'
import * as util from 'util'
import CaptainConstants from './CaptainConstants'
import Logger from './Logger'
import Utils from './Utils'
const execFile = util.promisify(childProcess.execFile)

export default class GitHelper {
    private static SSH_PATH_RE = new RegExp(
        [
            /^\s*/,
            /(?:(?<proto>[a-z]+):\/\/)?/,
            /(?:(?<user>[a-z_][a-z0-9_-]+)@)?/,
            /(?<domain>[^\s/?#:]+)/,
            /(?::(?<port>[0-9]{1,5}):?)?/,
            /(?:[/:](?<owner>[^\s/?#:]+))?/,
            /(?:[/:](?<repo>(?:[^\s?#:.]|\.(?!git\/?\s*$))+))/,
            /(?:(?<suffix>.git))?\/?\s*$/,
        ]
            .map((r) => r.source)
            .join(''),
        'i'
    )

    static getLastHash(directory: string) {
        return git(directory) //
            .silent(true) //
            .raw(['rev-parse', 'HEAD']) //
    }

    static clone(
        username: string,
        pass: string,
        sshKey: string,
        repo: string,
        branch: string,
        directory: string
    ) {
        const USER = username || ''
        const PASS = pass || ''

        if (sshKey) {
            const SSH_KEY_PATH = path.join(
                CaptainConstants.captainRootDirectoryTemp,
                uuid.v4()
            )

            const sanitized = GitHelper.sanitizeRepoPathSsh(repo)
            const REPO_GIT_PATH = sanitized.repoPath
            const SSH_PORT = sanitized.port

            const DOMAIN =
                GitHelper.getDomainFromSanitizedSshRepoPath(REPO_GIT_PATH)
            if (!DOMAIN) {
                throw new Error('SSH repository domain is missing')
            }

            Logger.d(`Cloning SSH ${REPO_GIT_PATH}`)

            return Promise.resolve() //
                .then(function () {
                    return fs.outputFile(SSH_KEY_PATH, sshKey + '')
                })
                .then(function () {
                    return execFile('chmod', ['600', SSH_KEY_PATH])
                })
                .then(function () {
                    return fs.ensureDir('/root/.ssh')
                })
                .then(function () {
                    return execFile('ssh-keyscan', [
                        '-p',
                        `${SSH_PORT}`,
                        '-H',
                        DOMAIN,
                    ]).then((result) =>
                        fs.appendFile('/root/.ssh/known_hosts', result.stdout)
                    )
                })
                .then(function () {
                    return git() //
                        .silent(true) //
                        .env('GIT_SSH_COMMAND', `ssh -i ${SSH_KEY_PATH}`) //
                        .raw([
                            'clone',
                            '--recurse-submodules',
                            '-b',
                            branch,
                            REPO_GIT_PATH,
                            directory,
                        ])
                })
                .finally(function () {
                    return fs.remove(SSH_KEY_PATH)
                })
        } else {
            // Some people put https when they are entering their git information
            const REPO_PATH = GitHelper.sanitizeRepoPathHttps(repo)

            // respect the explicit http repo path
            const SCHEME = repo.startsWith('http://') ? 'http' : 'https'

            if (SCHEME === 'http' && (USER || PASS)) {
                throw new Error(
                    'HTTPS is required when Git clone credentials are provided'
                )
            }

            const ASKPASS_PATH = path.join(
                CaptainConstants.captainRootDirectoryTemp,
                uuid.v4()
            )
            const remote = `${SCHEME}://${REPO_PATH}`
            Logger.dev(
                `Cloning HTTPS ${SCHEME}://${REPO_PATH} with temporary credentials`
            )
            const askPassScript = [
                '#!/bin/sh',
                'case "$1" in',
                '  *Username*) printf "%s\\n" "$CAPROVER_GIT_USERNAME" ;;',
                '  *Password*) printf "%s\\n" "$CAPROVER_GIT_PASSWORD" ;;',
                '  *) exit 1 ;;',
                'esac',
                '',
            ].join('\n')

            return Promise.resolve()
                .then(() => fs.outputFile(ASKPASS_PATH, askPassScript))
                .then(() => execFile('chmod', ['700', ASKPASS_PATH]))
                .then(() =>
                    git()
                        .silent(true)
                        .env('GIT_ASKPASS', ASKPASS_PATH)
                        .env('GIT_TERMINAL_PROMPT', '0')
                        .env('CAPROVER_GIT_USERNAME', USER)
                        .env('CAPROVER_GIT_PASSWORD', PASS)
                        .raw([
                            'clone',
                            '--recurse-submodules',
                            '-b',
                            branch,
                            remote,
                            directory,
                        ])
                )
                .finally(() => fs.remove(ASKPASS_PATH))
        }
    }

    // input is like this: ssh://git@github.com:22/caprover/caprover-cli.git
    static getDomainFromSanitizedSshRepoPath(input: string): string {
        const domain = GitHelper.sanitizeRepoPathSsh(input).domain
        if (!domain) throw new Error('SSH repository domain is missing')
        return domain
    }

    // It returns a string like this "github.com/username/repository.git"
    static sanitizeRepoPathHttps(input: string) {
        input = Utils.removeHttpHttps(input).replace(/\/$/, '')

        if (input.toLowerCase().startsWith('git@')) {
            // at this point, input is like git@github.com:caprover/caprover-cli.git
            input = input.substring(4)
            input = input.replace(':', '/')
        }

        try {
            const parsed = new URL(`https://${input}`)
            parsed.username = ''
            parsed.password = ''
            return `${parsed.host}${parsed.pathname}`.replace(/\/$/, '')
        } catch {
            // Keep the historical permissive path handling for unusual Git
            // hosts, but never carry an embedded username into clone args.
            return input.replace(/^[^/@]+@/, '').replace(/\/$/, '')
        }
    }

    // It returns a string like this "ssh://git@github.com:22/caprover/caprover-cli.git"
    static sanitizeRepoPathSsh(input: string) {
        const found = input.match(GitHelper.SSH_PATH_RE)
        if (!found) {
            throw new Error(`Malformatted SSH path: ${input}`)
        }

        const port = Number(found.groups?.port ?? 22)
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error('SSH repository port is invalid')
        }

        return {
            user: found.groups?.user ?? 'git',
            domain: found.groups?.domain,
            port,
            owner: found.groups?.owner ?? '',
            repo: found.groups?.repo,
            suffix: found.groups?.suffix ?? '',
            get repoPath() {
                return `ssh://${this.user}@${this.domain}:${this.port}/${
                    this.owner
                }${this.owner && '/'}${this.repo}${this.suffix}`
            },
        }
    }
}
