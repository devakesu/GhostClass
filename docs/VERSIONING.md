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
