<div align="center">
<h1>CapRover Next</h1>
<a href="https://hub.docker.com/r/ddornellas/caprover-next/" target="_blank" title="Docker Pulls">
<img src="https://img.shields.io/docker/pulls/ddornellas/caprover-next.svg" alt="Docker Pulls"/>
</a>
<a href="https://github.com/ddornellas/caprover_next/releases" target="_blank" title="GitHub release (latest by date)">
<img src="https://img.shields.io/github/v/release/ddornellas/caprover_next" alt="GitHub release (latest by date)"/>
</a>

Easiest app/database deployment platform and webserver package for your NodeJS, Python, PHP, Ruby, Go applications.

No Docker, nginx knowledge required!

<a href="https://youtu.be/VPHEXPfsvyQ" target="_blank" title="YouTube">
<img src="https://raw.githubusercontent.com/caprover/caprover-website/master/graphics/screenshots-video-small.png" alt="YouTube"/>
</a>
</div>

## What's this?

CapRover Next is a separately distributed fork of CapRover with an automated,
secure VM installer and additional control-plane improvements. It keeps the
CapRover runtime contracts (`captain-*`, `/captain`, and API v2) so existing
data can be migrated without renaming Docker resources. It is not an official
CapRover distribution.

CapRover is an extremely easy to use app/database deployment & web server manager for your **NodeJS, Python, PHP, ASP.NET, Ruby, MariaDB, MySQL, MongoDB, Postgres, WordPress (and etc...)** applications!

It's blazingly fast and very robust as it uses Docker, nginx, LetsEncrypt and NetData under the hood behind its simple-to-use interface.

✔ CLI for automation and scripting

✔ Web GUI for ease of access and convenience

✔ No lock-in! Remove CapRover and your apps keep working!

✔ Docker Swarm under the hood for containerization and clustering

✔ Nginx (fully customizable template) under the hood for load-balancing

✔ Let's Encrypt under the hood for free SSL (HTTPS)

### Seriously! Who should care about CapRover?

-   A [web] developer who does not like spending hours and days setting up a server, build tools, sending code to server, build it, get an SSL certificate, install it, update nginx over and over again.
-   A developer who uses expensive services like Heroku, Microsoft Azure and etc. And is interested in reducing their cost by 50x (Heroku charges 250USD/month for their 2gb instance, the same server is 5$ on Hetzner!!)
-   Someone who prefers to write more of `showResults(getUserList())` and not much of `$ apt-get install libstdc++6 > /dev/null`
-   A developer who likes installing MariaDB, MySQL, MongoDB and etc on their server by selecting from a dropdown and clicking on install!
-   How much server/docker/linux knowledge is required to set up a CapRover server? Answer: Knowledge of Copy & Paste!! Head over to "Getting Started" for information on what to copy & paste ;-)

## Learn More!

For installation and release details, see the
[VM installation and release runbook](docs/VM_DEPLOYMENT_AND_RELEASE.md).
For upstream product documentation, visit https://CapRover.com/.

## Repository operations

Maintainers working from this repository should use the
[VM installation, deployment, and release runbook](docs/VM_DEPLOYMENT_AND_RELEASE.md).
It documents the current Node.js 24 build, Docker image channels, GitHub
Actions release flow, and the safe way to update a VM.

For contribution and local development details, see
[CONTRIBUTING.md](CONTRIBUTING.md) and the [frontend development notes](frontend/README.md).
The planned frontend, agent-access, and log-observability work is tracked in
the [roadmap](ROADMAP.md).
For the agent API contract and deployment examples, see
[agent access](docs/AGENT_ACCESS.md).

## Integrations and notifications

The Settings page includes an optional account integration for notifications,
event reporting, and two-factor authentication. The interface intentionally
uses neutral integration language while preserving the existing API v2
compatibility paths.

From **Settings → Integrations and alerts**, an administrator can:

- connect, replace, or disconnect the integration API key;
- configure login, successful-build, and failed-build notifications;
- choose email or webhook delivery for each notification type;
- provide webhook metadata as JSON; and
- configure or disable two-factor authentication.

API keys are accepted only as non-empty strings, are never returned to the
frontend after connection, and are cleared together with alert and
two-factor settings when the integration is disconnected. The existing
endpoints remain available for compatible clients:

```text
POST /api/v2/user/pro/apikey/
POST /api/v2/user/pro/apikey/disconnect/
GET  /api/v2/user/pro/configs/
POST /api/v2/user/pro/configs/
GET  /api/v2/user/pro/otp/
POST /api/v2/user/pro/otp/
```

## Upstream attribution

CapRover Next retains the upstream CapRover license and acknowledges the
contributors to the original project. [[Contribute](CONTRIBUTING.md)].
<a href="https://github.com/caprover/caprover/graphs/contributors"><img src="https://opencollective.com/caprover/contributors.svg?width=690&button=false" /></a>
