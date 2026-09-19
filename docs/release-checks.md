# Published release checks

In **Settings → About**, tap **i** beside the version. Amber means newer published versions are known; normal text colour is used for current or unavailable results. The bubble distinguishes them explicitly.

The backend checks public GitHub release metadata about once per day. Displays share the saved result; opening About does not contact GitHub. No token or telemetry is sent, nothing upgrades automatically, and failures do not affect radar/weather health.

Counts include distinct newer published versions, including pre-releases, but exclude drafts, plain tags and commits. Semantic ordering is used instead of publication date: an older maintenance release published later is still older.

The breakdown describes successive version transitions. From 0.5.0 through 0.5.1, 0.6.0 and 0.6.1, there are three releases: two patch and one minor transition. Pre-release status is counted separately; all three could also be pre-releases. Same-core suffix progression or promotion to stable is a pre-release transition. Promoting the same tag adds no new version. Before 1.0, version numbers do not promise compatibility. Read the notes before upgrading; a published release is not proof that its container build has finished.

The date belongs to the last successful check. If a later check fails, that result stays visible with a separate explanation. An aged result awaiting refresh is labelled as saved. No successful check means unavailable, not current.

Unknown/development versions, builds with metadata and versions absent from the checked releases are not called current. Checks are bounded to three pages of 100 releases, 20 seconds total and 2 MiB per page. Incomplete history says “at least” and omits an exact breakdown. Unrecognized published version tags also make history incomplete.

Attempts and results persist in the data volume across restarts. Rate-limit instructions can delay the next attempt beyond one day. There is no browser-triggered upstream refresh. The [GitHub release API](https://docs.github.com/en/rest/releases/releases) supplies metadata; release bodies are neither cached nor rendered.
