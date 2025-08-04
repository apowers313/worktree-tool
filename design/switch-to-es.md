# ES Modules Migration Plan for worktree-tool

## Overview

This document outlines the plan to modernize the worktree-tool package from CommonJS to ES modules (ESM). The migration will include updating the build system, testing framework (if needed), and all source code to use modern ES module syntax.

## Current State Analysis

### Package Configuration
- **Node version**: >=18.0.0 (supports ESM natively)
- **TypeScript target**: ES2022
- **Module system**: CommonJS
- **Build tool**: tsc (TypeScript compiler)
- **Test framework**: Jest with ts-jest
- **Dependencies**:
  - chalk: 4.1.2 (ESM support available in v5+)
  - commander: 12.0.0 (ESM compatible)
  - simple-git: 3.28.0 (ESM compatible)

### Code Structure
- All source files use ES6 import/export syntax
- TypeScript compiles to CommonJS for distribution
- Shebang present in entry file (`#!/usr/bin/env node`)
- Module aliases configured (`@/` prefix)

## Migration Steps

### Phase 1: Update Package Configuration

1. **Update package.json**:
   ```json
   {
     "type": "module",
     "main": "./dist/index.js",
     "exports": {
       ".": {
         "import": "./dist/index.js",
         "types": "./dist/index.d.ts"
       }
     },
     "engines": {
       "node": ">=18.0.0"
     }
   }
   ```

2. **Update TypeScript configuration**:
   ```json
   {
     "compilerOptions": {
       "module": "ES2022",
       "moduleResolution": "bundler",
       "esModuleInterop": true,
       "allowSyntheticDefaultImports": true
     }
   }
   ```

### Phase 2: Update Dependencies

1. **Upgrade chalk to v5**:
   - Update from 4.1.2 to ^5.3.0 for native ESM support
   - Update all chalk imports to use default export: `import chalk from 'chalk';`

2. **Verify ESM compatibility**:
   - commander: Already ESM compatible
   - simple-git: Already ESM compatible

### Phase 3: Update Source Code

1. **File extensions**:
   - Keep `.ts` extensions for TypeScript files
   - Update import statements to include `.js` extensions for relative imports
   - Example: `import {Git} from "./git.js";` (TypeScript will resolve correctly)

2. **Update imports**:
   - Add `.js` extensions to all relative imports
   - Keep bare module specifiers for npm packages
   - Update path imports to use URL resolution where needed

3. **Handle Node.js built-ins**:
   - Update `__dirname` usage to `import.meta.url`
   - Example:
     ```typescript
     import { fileURLToPath } from 'url';
     import { dirname } from 'path';
     
     const __filename = fileURLToPath(import.meta.url);
     const __dirname = dirname(__filename);
     ```

4. **Update shebang handling**:
   - Ensure the compiled `dist/index.js` maintains the shebang
   - May need a build script to prepend shebang after compilation

### Phase 4: Update Build System

1. **Build script modifications**:
   - Create a post-build script to ensure shebang is preserved
   - Update build process to handle ESM output correctly

2. **Development workflow**:
   - Replace `ts-node` with `tsx` for ESM support
   - Update dev script: `"dev": "tsx src/index.ts"`

### Phase 5: Migrate Testing Framework

Since Jest has limited ESM support and requires additional configuration, we'll migrate to Vitest which has native ESM support.

1. **Install Vitest**:
   ```bash
   npm uninstall jest ts-jest @types/jest
   npm install -D vitest @vitest/ui c8
   ```

2. **Create vitest.config.ts**:
   ```typescript
   import { defineConfig } from 'vitest/config';
   import path from 'path';

   export default defineConfig({
     test: {
       globals: true,
       environment: 'node',
       setupFiles: ['./test/setup.ts'],
       include: [
         'test/unit/**/*.test.ts',
         'test/helpers/**/*.test.ts'
       ],
       exclude: [
         'node_modules',
         'dist',
         'test/integration',
         'test/e2e'
       ],
       coverage: {
         provider: 'c8',
         reporter: ['text', 'lcov', 'html'],
         exclude: [
           'node_modules',
           'dist',
           'test',
           'src/index.ts'
         ]
       }
     },
     resolve: {
       alias: {
         '@': path.resolve(__dirname, './src')
       }
     }
   });
   ```

3. **Update test files**:
   - Replace Jest globals with Vitest imports where needed
   - Update mock syntax from `jest.fn()` to `vi.fn()`
   - Update test setup files

4. **Create separate configs for slow tests**:
   - `vitest.config.integration.ts` for integration tests
   - `vitest.config.e2e.ts` for e2e tests

### Phase 6: Update Scripts and Configuration

1. **Update package.json scripts**:
   ```json
   {
     "scripts": {
       "build": "tsc && node scripts/add-shebang.js",
       "dev": "tsx src/index.ts",
       "test": "vitest run",
       "test:watch": "vitest",
       "test:coverage": "vitest run --coverage",
       "test:integration": "vitest run -c vitest.config.integration.ts",
       "test:e2e": "vitest run -c vitest.config.e2e.ts",
       "test:all": "npm test && npm run test:integration && npm run test:e2e",
       "typecheck": "tsc --noEmit"
     }
   }
   ```

2. **Create build helper script** (`scripts/add-shebang.js`):
   ```javascript
   import { readFileSync, writeFileSync } from 'fs';
   import { fileURLToPath } from 'url';
   import { dirname, join } from 'path';

   const __dirname = dirname(fileURLToPath(import.meta.url));
   const indexPath = join(__dirname, '../dist/index.js');

   const content = readFileSync(indexPath, 'utf8');
   if (!content.startsWith('#!/usr/bin/env node')) {
     writeFileSync(indexPath, '#!/usr/bin/env node\n' + content);
   }
   ```

3. **Update ESLint configuration**:
   - Ensure ESLint config handles ESM syntax
   - Update parser options for ESM

### Phase 7: Update Module Resolution

1. **Fix module aliases**:
   - Update TypeScript paths configuration
   - Ensure Vitest resolves aliases correctly
   - Consider using a runtime alias resolver if needed

2. **Handle dynamic imports**:
   - Review any dynamic imports and ensure they work with ESM
   - Update lazy loading patterns if present

### Phase 8: Testing and Validation

1. **Test build process**:
   - Verify TypeScript compilation works
   - Ensure shebang is preserved
   - Test the CLI binary works correctly

2. **Run all tests**:
   - Unit tests with Vitest
   - Integration tests
   - E2E tests
   - Manual testing of CLI commands

3. **Verify package installation**:
   - Test local installation with `npm link`
   - Test in a fresh project
   - Verify binary execution works

## Implementation Order

1. Create feature branch for ESM migration
2. Update TypeScript configuration
3. Install tsx and update dev workflow
4. Update all import statements with `.js` extensions
5. Migrate from Jest to Vitest
6. Update package.json with `"type": "module"`
7. Upgrade chalk to v5
8. Fix any ESM-specific issues (\_\_dirname, etc.)
9. Update build process
10. Run comprehensive tests
11. Update documentation

## Potential Issues and Solutions

### Issue 1: Module resolution errors
**Solution**: Ensure all relative imports include `.js` extension and TypeScript is configured with `"moduleResolution": "bundler"`

### Issue 2: Jest compatibility
**Solution**: Migrate to Vitest which has native ESM support

### Issue 3: Shebang preservation
**Solution**: Use post-build script to ensure shebang is present in compiled output

### Issue 4: Dependency compatibility
**Solution**: Upgrade chalk to v5 for ESM support; other dependencies are already compatible

### Issue 5: Development tooling
**Solution**: Replace ts-node with tsx which has better ESM support

## Benefits of Migration

1. **Future-proof**: ESM is the standard for JavaScript modules
2. **Better tree-shaking**: Improved bundle optimization
3. **Native Node.js support**: No transpilation needed for modules
4. **Improved developer experience**: Better IDE support and type inference
5. **Performance**: Faster module loading in Node.js
6. **Compatibility**: Better interoperability with modern tools and frameworks

## Testing Checklist

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All e2e tests pass
- [ ] CLI binary executes correctly
- [ ] Package installs correctly via npm
- [ ] All commands work as expected
- [ ] No regression in functionality
- [ ] Build process completes successfully
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Coverage reports generate correctly

## Rollback Plan

If issues arise during migration:
1. Keep the CommonJS version on a separate branch
2. Document any breaking changes
3. Consider dual-module support if needed (both CJS and ESM)
4. Revert to CommonJS if critical issues cannot be resolved

## Conclusion

This migration plan provides a systematic approach to modernizing the worktree-tool package to use ES modules. The key challenges are around testing framework migration and ensuring all tooling works correctly with ESM. By following this plan, we can successfully migrate while maintaining full functionality and test coverage.