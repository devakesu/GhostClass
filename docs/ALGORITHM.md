# Attendance Calculation Algorithm

Detailed documentation of the core attendance calculation and bunk logic used in
GhostClass (Web and Mobile).

## Core Algorithm

The algorithm is implemented with parity in both
[bunk.ts](src/lib/logic/bunk.ts) (Web) and
[bunk.dart](mobile/lib/logic/bunk.dart) (Mobile).

### Calculation Flow

```typescript
function calculateAttendance(present, total, targetPercentage):

1. **Input Validation & Normalization**
   - Ensure `total > 0`, `present >= 0`, `present <= total`
   - Clamp `targetPercentage` between 1–100 (default: 75)
   - Handle floating-point precision via `PERCENTAGE_EPSILON = 1e-9`

2. **Calculate Current Percentage**
   - `currentPercentage = (present / total) * 100`

3. **Below Target - Calculate Required Classes**
   - If `currentPercentage < (target - epsilon)`:
     - If `target >= 100`: `requiredToAttend = Infinity` (cannot reach 100% if any class missed)
     - Else: `required = ceil((target * total - 100 * present) / (100 - target))`
     - Result: `requiredToAttend = required`

4. **Above/At Target - Calculate Bunkable Classes**
   - If `currentPercentage >= (target - epsilon)`:
     - `bunkableExact = (100 * present - target * total) / target`
     - `bunkable = floor(bunkableExact + epsilon)`
     - Result: `canBunk = bunkable`

5. **Edge States**
   - **Borderline**: If `canBunk == 0` (above target but cannot skip a full class yet)
   - **Exact**: If `abs(currentPercentage - target) < epsilon`

return { canBunk, requiredToAttend, isExact, isBorderline }
```

### Formula Derivation

To reach a `target%` by attending `x` additional classes:

```text
(present + x) / (total + x) = target / 100
100(present + x) = target(total + x)
100*present + 100x = target*total + target*x
100x - target*x = target*total - 100*present
x(100 - target) = target*total - 100*present
x = (target*total - 100*present) / (100 - target)
```

## Manual Tracking Integration

The calculation combines official data with user-added modifiers:

1. **Official Data**: Fetched from EzyGo API (`realPresent`, `realTotal`,
   `realAbsent`).
2. **Manual Modifiers**:
   - `extraPresent/extraAbsent`: Additional classes marked by user (adds to
     total).
   - `correctionPresent`: Wrongly marked absences corrected to present (status
     swap only).

### Final Calculation Formula

```text
finalPresent = realPresent + correctionPresent + extraPresent
finalTotal = realTotal + (extraPresent + extraAbsent)
displayPercentage = (finalPresent / finalTotal) * 100
```

## Duty Leave Rules

**Attendance Code 225 Limit**: Maximum 5 duty leave entries per course per
semester.

- Enforced via database trigger `check_225_attendance_limit()` in the `tracker`
  table.

- Raises an exception if exceeded to maintain data integrity.

## Example Scenarios

| Scenario           | Present | Total | Target | Result                 |
| :----------------- | :------ | :---- | :----- | :--------------------- |
| **At Target**      | 45      | 60    | 75%    | `isExact = true`       |
| **Can Bunk**       | 50      | 60    | 75%    | `canBunk = 6`          |
| **Need to Attend** | 40      | 60    | 75%    | `requiredToAttend = 6` |
