# Permissions

The server is authoritative. Hidden UI controls are convenience only. Every request must recheck an active session and current account state; page and record references must be authorized on lookup.

| Action | Owner | Active member |
| --- | --- | --- |
| View content from either page | Yes | Yes |
| Suggest revisions / voice feedback | Yes | Requires independent page `can_suggest` |
| Create/edit output, upload content media, schedule, manage unpublished stories | Yes | Requires page `can_edit` |
| Final approval or revoke approval | Yes | No |
| Manage users, page settings, permissions or reminder responsibility | Yes | No |
| Download approved publication assets | Yes | Yes |
| Claim and record publication of the current approved revision | Yes | Yes |
| Enter content analytics and weekly reports | Yes | Yes |
| View analytical aggregates and Reports | Yes | Requires page `can_report` |
| Create personal recurring/one-off tasks | Yes | Yes |
| Assign Priority 1 work to another member | Yes | No |
| Change owner-assigned recurrence templates | Yes | No |
| Complete own assigned task occurrences | Yes | Yes |
| Release another member's abandoned publication claim | Yes | No |

`can_edit`, `can_suggest`, and `can_report` are independent. Editing does not grant report visibility; data entry does not grant access to page trends or other aggregate queries. Today, Reports, comparison datasets, exports and direct API requests must respect the same report restriction. Historical entry records needed to correct data must not expose unauthorized aggregate information.

Suggestions are feedback records and do not invalidate approval. Output-affecting edits create a new revision and revoke the old approval. Schedule-only mutations preserve approval. Publishing checks the current revision and approval inside the transaction. Knowing an older revision, media identifier or package ID cannot bypass these checks.

Private media access follows purpose and referenced records. Unapproved publication originals must not become a download route around approval. Feedback, music, Insights screenshots and avatars have their own appropriate viewing context. The media directory is never a public web root. No unauthenticated share links are created by default.

Bootstrap creates the single owner with a strong entered password. Members are created by the owner; there is no public registration. Deactivation prevents future authenticated requests. Permission changes must be effective on the next request rather than depending on a stale browser snapshot.

Audit logs record meaningful changes, approvals, corrections, publication and administrative actions. Never include cleartext passwords, session tokens, Push private keys or raw private media in logs. See [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) for the tests that establish the implemented boundaries.
