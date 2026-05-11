# Versioning System

GhostClass follows a modified [Semantic Versioning 2.0.0](https://semver.org/) system with a **rollover mechanism** for patch and minor versions.

## Version Format: `X.Y.Z`

- **X (Major)**: Significant structural changes, breaking API changes, or major project milestones. Can exceed `9`.
- **Y (Minor)**: New features or significant enhancements. Rollover at `9` (increments X and resets Y to 0).
- **Z (Patch)**: Bug fixes, security patches, or minor documentation updates. Rollover at `9` (increments Y and resets Z to 0).

### Rollover Examples

| Current Version | Bump Type | New Version | Reason |
| --- | --- | --- | --- |
| `1.5.5` | Patch | `1.5.6` | Normal increment |
| `1.5.9` | Patch | `1.6.0` | Patch rollover (Z=9 → Y+1, Z=0) |
| `1.9.9` | Patch | `2.0.0` | Minor rollover (Y=9, Z=9 → X+1, Y=0, Z=0) |
| `10.3.5` | Minor | `10.4.0` | Normal increment |
| `10.9.2` | Minor | `11.0.0` | Minor rollover (Y=9 → X+1, Y=0) |

## Automation

GhostClass uses the **Auto Version Bump** workflow to handle versioning automatically:

1. **Same-repo PRs**: The workflow automatically increments the **patch** version (with rollover) and commits the change to your branch.
2. **Version Branches**: To manually control a major or minor bump, create a branch named after the target version (e.g., `2.0.0`). The workflow will use that version without auto-incrementing.
3. **Fork PRs**: External contributors are guided by the bot to run a local script (`npm run bump-version`) to update the version before merging.

## Files Updated

The following files are kept in sync by the versioning system:

- `package.json`
- `package-lock.json`
- `.example.env` (`NEXT_PUBLIC_APP_VERSION`)
- `public/openapi/openapi.yaml`
- `mobile/pubspec.yaml` (Manually synced by maintainers or via specialized mobile release jobs)
