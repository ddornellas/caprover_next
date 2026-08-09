# Agent access

CapRover exposes a separate agent channel under `/api/v2/agent/`. Agents use
an API key instead of the root password and never need SSH or the Docker
socket.

## Create a key

An administrator can create a key in **Settings → Agent access**. Every key
must have:

- a name;
- one role: `read`, `deploy_approval`, or `deploy`;
- an explicit list of app names. Names may refer to apps that do not exist yet;
  this is how an agent is allowed to request creation of a specific new app;
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

## Deploy an app

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

To request a new app, use an exact app name already included in the key scope
and set `createApp` to `true`. The optional description is shown to the human
approver and in **Apps** while the request is pending:

```json
{
  "appName": "new-api",
  "createApp": true,
  "description": "API created by the release agent",
  "captainDefinition": {
    "schemaVersion": 2,
    "imageName": "registry.example.com/new-api:abc123"
  }
}
```

`read` keys receive 403 for this endpoint. `deploy_approval` keys create a
pending request and return its deployment ID. For a new app, that request is
immediately visible in **Apps** with status `On approval`; it does not create a
Docker service until a human approves it. A human administrator must approve
it in **Settings → Agent access** before the deploy starts. `deploy` keys start
new-app deploys directly. Poll the returned ID at
`/api/v2/agent/deployments/:id`.

Apps use three statuses: `Published` for a running app, `On approval` for a
new app waiting for a human approval, and `Paused` when its instance count is
zero. Pending apps cannot be opened or deleted from the Apps list.

The agent channel deliberately has no app deletion, rename, volume deletion,
registry administration, Swarm administration, arbitrary command, or SSH
operation. Deployments are always checked against the key's exact allowlist;
there are no wildcards or permissions to create an arbitrary app name.
