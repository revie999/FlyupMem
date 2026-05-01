# Triage Labels

These 5 labels drive the triage state machine. They must exist on the GitHub repo.

| Label | State | Meaning |
|-------|-------|---------|
| `needs-triage` | Initial | New issue, maintainer needs to evaluate |
| `needs-info` | Waiting | Waiting on reporter for more details |
| `ready-for-agent` | Ready | Fully specified, an AI agent can pick this up autonomously |
| `ready-for-human` | Ready | Needs human implementation or judgment |
| `wontfix` | Closed | Will not be actioned |

## Setup

Run once to create labels on GitHub:

```bash
gh label create "needs-triage" --color "FBCA04" --description "Needs maintainer evaluation"
gh label create "needs-info" --color "0E8A16" --description "Waiting on reporter"
gh label create "ready-for-agent" --color "1D76DB" --description "Agent can pick up"
gh label create "ready-for-human" --color "D93F0B" --description "Needs human work"
gh label create "wontfix" --color "FFFFFF" --description "Will not fix"
```
