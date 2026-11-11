# BugHound API

FastAPI backend for the existing React application. It uses PostgreSQL, OpenRouter, GitHub's HTTPS API, and a separately configured CI runner. No Docker or Docker Compose is used.

## Safety and authorization

- Only canonical public GitHub repository URLs are accepted, and only repositories listed in `AUTHORIZED_REPOSITORIES` can be analyzed or modified.
- Customers submit bug details only. Tickets remain `pending_admin` until an administrator assigns an allowlisted repository through `POST /api/admin/tickets/{id}/repository`; that action moves the ticket to the worker queue. The API does not start agent processing on customer submission.
- The API and worker never clone repositories or execute repository code. Agent 4 dispatches tests to `CI_RUNNER_URL`; the runner must be an authorized disposable CI environment with its own isolation and resource limits.
- An administrator must approve a patch after a successful Agent 4 callback. Approval rechecks the base commit and GitHub write authorization, creates a ticket branch, commits the approved files, and opens a pull request. The production/default branch is never written directly; automatic merging is not enabled.
- Tickets remain unresolved until the external runner reports successful post-PR build and test checks. Deployment and health checks must be reported as passed or explicitly `not_configured`.
- No agent, test, PR, deployment, or success result is simulated. Missing services become persisted blockers.

## Environment

Copy `.env.example` to `.env` and set:

- `DATABASE_URL`: PostgreSQL SQLAlchemy URL, for example `postgresql+psycopg://user:password@localhost:5432/bughound`.
- `JWT_SECRET`: at least 32 random characters. Keep it private.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`: initial admin identity; password must be at least 12 characters.
- `AUTHORIZED_REPOSITORIES`: comma-separated `owner/repo` entries, with no wildcard. Add only repositories for which the organization has explicit authorization.
- `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`: real OpenRouter credentials/model.
- `GITHUB_TOKEN`: token with Contents (read/write) and Pull requests (read/write) access only to authorized repositories. Public GitHub reads work without it; ticket approval is blocked without write authorization.
- `CI_RUNNER_URL`, `CI_RUNNER_TOKEN`, and `RUNNER_CALLBACK_SECRET`: authenticated external runner endpoint and callback secrets. Use separate high-entropy secrets.
- `PUBLIC_API_URL`: HTTPS-reachable API URL used by the runner to post results. For local-only development, callbacks cannot reach `localhost` from a remote runner.
- `CORS_ORIGINS`: comma-separated frontend origins.

Do not commit `.env` or send credentials to the frontend. The frontend receives only short-lived JWT access tokens.

## Windows startup (PowerShell)

From the project root, in two terminals:

```powershell
py -3.14 -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env
```

Set `.env` values, create the PostgreSQL database using your approved local/managed PostgreSQL installation, then:

```powershell
Set-Location backend
alembic upgrade head
python -m app.bootstrap_admin
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal, activate the same environment and run:

```powershell
Set-Location backend
python -m app.worker
```

The API is at `http://localhost:8000`; OpenAPI docs are at `/docs`. Liveness is `/health/live`; readiness is `/health/ready`. Run unit tests from `backend` with `python -m pytest`.

## Runner protocol

The backend sends an authenticated JSON POST to `CI_RUNNER_URL` containing `ticket_id`, a backend-generated persisted `run_id`, `phase` (`patch_tests` or `post_pr_verification`), repository URL, base branch/SHA, fix branch, patch SHA-256 and unified patch (for patch tests), and a callback URL. The runner must return `202` or `200` and echo the supplied `run_id` before asynchronous execution begins. It must not reuse untrusted repository code on the API host.

After execution, POST JSON to the callback URL with `X-Runner-Secret: $RUNNER_CALLBACK_SECRET`. Required fields: `phase`, `run_id`, `status` (`passed`, `failed`, or `cancelled`), `executed` (boolean), `exit_code`, `run_url` (HTTPS), `summary`, and bounded `logs`. For `patch_tests`, echo `base_commit_sha` and `patch_sha256` from the dispatch payload. For `post_pr_verification`, return `tested_commit_sha` matching the approved commit and include `verification` with actual `build` and `tests` statuses, plus `deployment` and `health_check` each set to `passed` or `not_configured`. A `passed` state is rejected unless execution is true and exit code is zero; post-PR success also requires passing build/tests and a matching commit SHA. The runner is responsible for binding each run to the submitted commit/patch and enforcing isolation. Protect callback secrets and use TLS.

The runner is intentionally an integration contract, not an unsafe local test executor. Until an authorized runner is configured, tickets show `testing_blocked` or `verification_blocked` and are not approved/resolved.

## API summary

- `POST /api/auth/login`, `GET /api/auth/me`
- `POST /api/admin/customers` (admin only; creates customer account)
- `POST /api/tickets` (customer-only bug intake; no repository required)
- `POST /api/admin/tickets/{id}/repository` (admin-only repository assignment and agent queue start)
- `GET /api/tickets`, `GET /api/tickets/{id}`, `GET /api/tickets/{id}/agents`
- `POST /api/admin/tickets/{id}/approve`, `POST /api/admin/tickets/{id}/reject`
- `GET /api/admin/integrations`, `GET /api/admin/audit`
- `POST /api/runner/tickets/{id}/result` (runner secret required)
