# Security Policy

## Supported Versions

Radiant Blaze is a continuously maintained personal website. Security updates are provided for the latest version available on the `main` branch.

| Version | Supported |
| ------- | --------- |
| Latest (`main`) | :white_check_mark: |
| Older commits and releases | :x: |

Only the latest maintained version is eligible for security fixes.

## Dependency and CI Automation

Dependabot checks npm packages and GitHub Actions weekly on Monday at 09:00
Pakistan time. npm minor and patch updates are grouped separately for production
and development dependencies. GitHub Actions minor and patch updates are grouped
together. Major updates stay in separate pull requests for review.

Version updates have a seven-day default cooldown. npm overrides that default
with a 30-day major, seven-day minor, and three-day patch cooldown. GitHub
Actions currently supports only the default cooldown in Dependabot, so its
updates use seven days for all version levels. Cooldowns apply to version
updates, not vulnerability security updates.

The existing CI workflow runs on pushes to every branch, pull requests to any
branch, and manual dispatch. It installs the lockfile with `npm ci`, audits
dependencies, builds the Astro site with Node.js 24, and runs the repository's
existing content and compatibility checks. The Pages deployment workflow stays
separate and deploys only from `main` (including manual dispatches made from
`main`), after its reusable CI verification succeeds.

Pull requests also run GitHub's Dependency Review Action in the existing CI
workflow. It compares dependency changes against the base branch and fails for
new high- or critical-severity vulnerabilities in runtime or development
dependencies. The action's default license check remains enabled; there are no
repository-specific license allow/deny rules at this time.

Dependabot pull requests targeting `main` can be auto-merged with squash after
the current head commit passes both CI verification and Dependency Review.
Only patch and minor updates are eligible, including security updates at those
update levels. Major updates remain manual. Failed checks, conflicts, or
changed pull request heads prevent the workflow from enabling auto-merge. It
does not check out or execute pull request code and does not approve pull
requests.

## GitHub Repository Security Settings

These features are controlled in repository settings, not by workflow or
Dependabot YAML. At the time this policy was updated, the repository settings
reported:

- Dependency graph: enabled.
- Dependabot alerts: enabled.
- Dependabot security updates: enabled.
- Secret scanning and push protection: enabled.
- CodeQL: GitHub's default code-scanning setup is configured. No separate
  CodeQL workflow is needed.
- GitHub auto-merge: enabled.
- The active `main-protection` ruleset requires pull requests, up-to-date
  branches, and the `Verify / Dependency review` and `Verify / Verify` checks.
  It also blocks force pushes and branch deletion. The Dependabot auto-merge
  workflow requests native auto-merge only after both required checks pass.

Repository owners must manage these settings in GitHub **Settings → Security
and analysis**. YAML changes alone cannot enable them, and availability may
depend on repository visibility, plan, or organization policy. The GitHub
auto-merge setting is under **Settings → General → Pull Requests**.

## Reporting a Vulnerability

If you discover a security vulnerability in Radiant Blaze, please report it responsibly.

**Please do not disclose security vulnerabilities through public GitHub issues or pull requests.**

Instead, use one of the following methods:

- **GitHub Private Vulnerability Reporting:** If enabled, use the [Security tab](https://github.com/Radiant-Blaze/radiant-blaze.github.io/security/advisories/new) to submit a private vulnerability report.
- **GitHub Security Advisories:** You can also navigate to the repository's Security tab and select *Report a vulnerability*.

### What to Include

Please provide as much relevant information as possible:

- A description of the vulnerability.
- Steps to reproduce the issue.
- Potential impact and affected components.
- Proof of concept or supporting evidence, if available.
- Suggested mitigation, if known.

### Response Timeline

- **Acknowledgment:** I aim to acknowledge reports within 7 days.
- **Investigation:** Reported vulnerabilities will be reviewed and investigated.
- **Resolution:** If accepted, I will work toward an appropriate fix and release an update.
- **Declined reports:** If a report is not considered a valid security vulnerability, an explanation will be provided where possible.

### Responsible Disclosure

Please allow reasonable time for investigation and remediation before publicly disclosing a vulnerability.

Thank you for helping keep Radiant Blaze secure.
