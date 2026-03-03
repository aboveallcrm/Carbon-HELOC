/**
 * Quick math verification for PMT & Interest-Only calculations.
 * Run:  npx ts-node heloc-app/test-math.ts
 *   or: npx tsx  heloc-app/test-math.ts
 */
import { calculatePMT, calculateInterestOnly } from './src/hooks/useQuoteCalculator';

let passed = 0;
let failed = 0;

function assert(label: string, actual: string, expected: string) {
    if (actual === expected) {
        console.log(`  PASS  ${label}: ${actual}`);
        passed++;
    } else {
        console.error(`  FAIL  ${label}: got ${actual}, expected ${expected}`);
        failed++;
    }
}

console.log('--- PMT Tests ---');
assert('$100k @ 5% / 30Y', calculatePMT(100000, 5, 30).toFixed(2), '536.82');
assert('$50k @ 7.5% / 20Y', calculatePMT(50000, 7.5, 20).toFixed(2), '402.80');
assert('$200k @ 0% / 30Y', calculatePMT(200000, 0, 30).toFixed(2), '555.56');

console.log('\n--- Interest-Only Tests ---');
assert('$100k @ 6%', calculateInterestOnly(100000, 6).toFixed(2), '500.00');
assert('$75k @ 8.5%', calculateInterestOnly(75000, 8.5).toFixed(2), '531.25');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
