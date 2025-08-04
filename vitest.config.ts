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