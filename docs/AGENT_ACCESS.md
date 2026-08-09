# Agent access

CapRover exposes a separate agent channel under `/api/v2/agent/`. Agents use
an API key instead of the root password and never need SSH or the Docker
socket.

## Create a key

An administrator can create a key in **Settings → Agent access**. Every key
must have:

- a name;
- one role: `read`, `deploy_approval`, or `deploy`;
- an explicit list of existing app names;
- an optional expiration date of at most one year.

The plaintext key is shown only once. CapRover stores only its SHA-256 hash.
Revoke an exposed key immediately from the same screen.

## Authentication

Send the key as a Bearer token:

```bash
export CAPROVER_AGENT_KEY='cr_agent_...'

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${CAPROVER_AGENT_KEY}" \
  https://captain.example.com/api/v2/agent
```

The response reports the key role and its app scope. A key cannot see or
mutate apps outside that exact scope.

## Read apps and logs

```bash
curl --fail --silent --show-error \
  -H "Authorization: Bearer ${CAPROVER_AGENT_KEY}" \
  https://captain.example.com/api/v2/agent/apps

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${CAPROVER_AGENT_KEY}" \
  https://captain.example.com/api/v2/agent/apps/my-api/logs
```

The responses intentionally contain safe app status data only. They do not
return environment variables, repository credentials, volumes, Docker
objects, or host details.

## Deploy an existing app

Agents can deploy an existing, scoped app using a restricted Captain
definition. The accepted payload contains only `appName`, `gitHash`, and a
Captain definition with `schemaVersion: 2` plus exactly one of `imageName` or
`dockerfileLines`.

```bash
curl --fail --silent --show-error -X POST \
  -H "Authorization: Bearer ${CAPROVER_AGENT_KEY}" \
  -H 'Content-Type: application/json' \
  https://captain.example.com/api/v2/agent/deployments \
  -d '{
    "appName": "my-api",
    "gitHash": "abc123",
    "captainDefinition": {
      "schemaVersion": 2,
      "imageName": "registry.example.com/my-api:abc123"
    }
  }'
```

`read` keys receive 403 for this endpoint. `deploy_approval` keys create a
pending request and return its deployment ID. A human administrator must
approve it in **Settings → Agent access** before the deploy starts. `deploy`
keys start the deploy directly. Poll the returned ID at
`/api/v2/agent/deployments/:id`.

The agent channel deliberately has no app deletion, rename, volume deletion,
registry administration, Swarm administration, arbitrary command, or SSH
operation. Deployments target existing apps only and are always checked
against the key's exact allowlist.
