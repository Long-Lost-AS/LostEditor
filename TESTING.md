# Testing Guide

This document provides guidelines for testing the LostEditor project.

## Table of Contents

- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Organization](#test-organization)
- [Coverage Requirements](#coverage-requirements)
- [Testing Patterns](#testing-patterns)
- [Troubleshooting](#troubleshooting)

## Running Tests

### Basic Commands

```bash
# Run tests in watch mode (recommended during development)
npm test

# Run tests once
npm run test:run

# Run tests with coverage
npm run test:coverage

# Run tests with interactive UI
npm run test:ui

# Run only tests related to changed files
npm run test:changed

# Run tests for CI (includes coverage and verbose output)
npm run test:ci

# Serve coverage report in browser
npm run coverage:serve
```

### Pre-commit Hooks

Tests related to your staged files will automatically run before each commit via Husky pre-commit hooks. This ensures code quality before changes are committed.

To skip hooks (not recommended):
```bash
git commit --no-verify
```

## Writing Tests

### Test File Location

Place test files in `__tests__` folders next to the code they test:

```
src/
  utils/
    tileId.ts
    __tests__/
      tileId.test.ts
  managers/
    MapManager.ts
    __tests__/
      MapManager.test.ts
  components/
    Dropdown.tsx
    __tests__/
      Dropdown.test.tsx
```

### Basic Test Structure

```typescript
import { describe, it, expect } from 'vitest';
import { functionToTest } from '../myModule';

describe('MyModule', () => {
  describe('functionToTest', () => {
    it('should handle basic case', () => {
      const result = functionToTest(input);
      expect(result).toBe(expected);
    });

    it('should handle edge case', () => {
      const result = functionToTest(edgeInput);
      expect(result).toBe(edgeExpected);
    });

    it('should throw error for invalid input', () => {
      expect(() => functionToTest(invalid)).toThrow();
    });
  });
});
```

### Test Naming Conventions

- Use descriptive test names that explain what is being tested
- Start with "should" to describe expected behavior
- Group related tests in `describe` blocks

**Good:**
```typescript
it('should pack tile coordinates correctly')
it('should throw error for negative coordinates')
it('should handle maximum tileset index')
```

**Bad:**
```typescript
it('works')
it('test 1')
it('edge case')
```

## Test Organization

### Test Categories

1. **Unit Tests** - Test individual functions/classes in isolation
   - Located in: `src/utils/__tests__/`, `src/managers/__tests__/`
   - Focus: Pure logic, no external dependencies
   - Example: `tileId.test.ts`, `deepEqual.test.ts`

2. **Integration Tests** - Test multiple components working together
   - Located in: `src/__tests__/integration/`
   - Focus: File I/O, manager interactions, data flow
   - Example: Map save/load round-trip tests

3. **Component Tests** - Test React components
   - Located in: `src/components/__tests__/`
   - Focus: User interactions, rendering, state changes
   - Use React Testing Library

4. **Property-Based Tests** - Test with generated inputs
   - Use fast-check library
   - Focus: Complex algorithms, bit manipulation
   - Example: Bitmask autotiling tests

## Coverage Requirements

### Global Thresholds

- **Line Coverage:** 60% minimum
- **Function Coverage:** 60% minimum
- **Branch Coverage:** 50% minimum
- **Statement Coverage:** 60% minimum

### By Code Area

Different areas have different coverage expectations:

| Area | Target Coverage | Priority |
|------|----------------|----------|
| Bit Manipulation (tileId, bitmask) | 90%+ | Critical |
| Serialization | 80%+ | High |
| Manager Classes | 70%+ | High |
| Utility Functions | 70%+ | High |
| Zod Schemas | 60%+ | Medium |
| React Components | 50%+ | Medium |

### Viewing Coverage

After running tests with coverage:

```bash
# View in terminal
npm run test:coverage

# View HTML report in browser
npm run coverage:serve
# Then open http://localhost:4173/
```

## Testing Patterns

### Using Test Factories

Use factory functions from `src/__mocks__/testFactories.ts` to create test data:

```typescript
import { createMockMap, createMockTileset } from '../__mocks__/testFactories';

it('should process map data', () => {
  const map = createMockMap({ width: 10, height: 10 });
  const tileset = createMockTileset({ tileWidth: 16 });

  // ... test logic
});
```

### Mocking Tauri APIs

Tauri APIs are automatically mocked in `src/test-setup.ts`. Access mocks via:

```typescript
import { tauriMocks } from '../test-setup';

it('should read file', async () => {
  tauriMocks.fs.readTextFile.mockResolvedValue('file contents');

  const content = await myFileReader.read('/path/to/file');

  expect(content).toBe('file contents');
});
```

### Testing Async Code

```typescript
it('should load map asynchronously', async () => {
  const map = await mapManager.loadFile('/path/to/map.lostmap');

  expect(map).toBeDefined();
  expect(map.width).toBe(32);
});
```

### Testing Error Cases

```typescript
it('should throw error for invalid input', () => {
  expect(() => packTileId(-1, 0, 0)).toThrow(
    'Tile sprite x coordinate -1 out of range'
  );
});

it('should reject invalid file format', async () => {
  await expect(
    mapManager.loadFile('/invalid.txt')
  ).rejects.toThrow();
});
```

### Snapshot Testing

Use snapshots for serialization and format stability:

```typescript
it('should serialize map data consistently', () => {
  const map = createMockMap({ width: 4, height: 4 });
  const serialized = serializeMapData(map);

  expect(serialized).toMatchSnapshot();
});
```

To update snapshots:
```bash
npm run test:run -- -u
```

### Property-Based Testing

For complex algorithms, use fast-check:

```typescript
import fc from 'fast-check';

it('should round-trip pack/unpack for all valid inputs', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 65535 }),
      fc.integer({ min: 0, max: 65535 }),
      fc.integer({ min: 0, max: 16383 }),
      (x, y, tilesetIndex) => {
        const packed = packTileId(x, y, tilesetIndex);
        const unpacked = unpackTileId(packed);

        return unpacked.x === x &&
               unpacked.y === y &&
               unpacked.tilesetIndex === tilesetIndex;
      }
    )
  );
});
```

## Troubleshooting

### Tests Fail with "Cannot find module"

Make sure all imports use correct paths. Vitest uses the same module resolution as your app.

### Tauri API Errors

If you see errors about Tauri APIs, check that:
1. `test-setup.ts` is in the `setupFiles` array in `vitest.config.ts`
2. You're using the mocked APIs, not real ones

### Canvas Tests Fail

Canvas operations are mocked. If you need to assert canvas operations:

```typescript
const ctx = canvas.getContext('2d');
expect(ctx.drawImage).toHaveBeenCalled();
```

### Tests Are Slow

- Reduce the number of files tested: `npm test -- path/to/specific/test.ts`
- Use `test.concurrent()` for independent tests
- Check for unnecessary async waits

### Coverage Threshold Errors

If coverage drops below thresholds:
1. Check which files lack coverage: view the HTML report
2. Add tests for uncovered code
3. If intentional, adjust thresholds in `vitest.config.ts`

### Pre-commit Hook Failures

If tests fail during commit:
1. Run `npm test` to see failures
2. Fix the issues
3. Stage the fixes and commit again

To temporarily bypass (not recommended):
```bash
git commit --no-verify
```

## Best Practices

1. **Test behavior, not implementation**
   - Focus on what the code does, not how it does it
   - Avoid testing internal/private methods directly

2. **Keep tests focused**
   - One concept per test
   - Use descriptive names
   - Arrange, Act, Assert pattern

3. **Write tests first for bugs**
   - Reproduce the bug with a test
   - Fix the bug
   - Test should pass

4. **Don't test third-party libraries**
   - Trust that React, Zod, etc. work correctly
   - Test your integration with them

5. **Use realistic test data**
   - Test with data similar to production
   - Include edge cases (empty arrays, null values, etc.)

6. **Keep tests maintainable**
   - Use factories for test data
   - Extract common setup to `beforeEach`
   - Don't repeat yourself

## CI/CD

Tests run automatically on:
- Every pull request
- Every push to `master`

The CI workflow:
1. Installs dependencies
2. Runs full test suite with coverage
3. Uploads coverage to Codecov
4. Fails if tests fail or coverage drops

View test results and coverage at:
- GitHub Actions tab in the repository
- Codecov dashboard (link in README)

## Contributing

When submitting a pull request:

1. **Write tests for new features**
   - All new code should have tests
   - Aim for 70%+ coverage on new files

2. **Update existing tests**
   - If you change behavior, update tests
   - Don't delete tests without good reason

3. **Run tests locally first**
   ```bash
   npm run test:run
   ```

4. **Check coverage**
   ```bash
   npm run test:coverage
   ```

5. **Ensure CI passes**
   - All tests must pass
   - Coverage must meet thresholds

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [fast-check (Property Testing)](https://fast-check.dev/)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

---

For questions or issues with testing, please open a GitHub issue.
