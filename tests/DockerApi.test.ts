import DockerApi from '../src/docker/DockerApi'

test('quotes node join command arguments before sending them to a remote shell', () => {
    const dockerApi = Object.create(DockerApi.prototype) as DockerApi

    expect(
        dockerApi.createJoinCommand(
            '10.0.0.1; touch /tmp/pwned',
            "token-with-'-chars",
            '10.0.0.2 && touch /tmp/pwned'
        )
    ).toBe(
        "docker swarm join --token 'token-with-'\\''-chars' '10.0.0.1; touch /tmp/pwned:2377' --advertise-addr '10.0.0.2 && touch /tmp/pwned:2377'"
    )
})
