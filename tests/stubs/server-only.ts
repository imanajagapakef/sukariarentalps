/**
 * Vitest stub for the `server-only` marker package.
 *
 * `server-only` ships an empty module under the `react-server` export
 * condition and a throwing module otherwise. Integration tests here import
 * `@/lib/supabase/admin`, which uses the marker to keep the service-role key
 * out of Client Components — but the tests run in Node, where the throwing
 * entry would resolve. Vitest is mapped to this no-op via `vitest.config.ts`
 * so the marker keeps its real job in the Next build without breaking tests.
 */
export {};
