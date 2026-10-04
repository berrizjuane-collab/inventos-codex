import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Run after other measurements: node scripts/math-report.mjs
// Vite resolves the TypeScript engine's extensionless imports without changing it.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'evidence', 'math-final.json');
const coordinates = [-2, -1, 0, 1, 2];
const points = coordinates.flatMap(x => coordinates.flatMap(y => coordinates.map(z => [x, y, z])));
const zeroJacobian = () => [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

// Expected vectors, Jacobians and operators are handwritten independently.
// No expected result calls the catalog's evaluate/jacobian or mathjs derivative.
const references = [
  {
    id: 'uniform', components: ['1', '0', '0'],
    reference: () => ({ vector: [1, 0, 0], jacobian: zeroJacobian(), divergence: 0, curl: [0, 0, 0] }),
  },
  {
    id: 'outward', components: ['x', 'y', 'z'],
    reference: ([x, y, z]) => ({ vector: [x, y, z], jacobian: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], divergence: 3, curl: [0, 0, 0] }),
  },
  {
    id: 'inward', components: ['-x', '-y', '-z'],
    reference: ([x, y, z]) => ({ vector: [-x, -y, -z], jacobian: [[-1, 0, 0], [0, -1, 0], [0, 0, -1]], divergence: -3, curl: [0, 0, 0] }),
  },
  {
    id: 'rotation', components: ['-y', 'x', '0'],
    reference: ([x, y]) => ({ vector: [-y, x, 0], jacobian: [[0, -1, 0], [1, 0, 0], [0, 0, 0]], divergence: 0, curl: [0, 0, 2] }),
  },
  {
    id: 'helix', components: ['-y', 'x', 'a'],
    reference: ([x, y]) => ({ vector: [-y, x, 1], jacobian: [[0, -1, 0], [1, 0, 0], [0, 0, 0]], divergence: 0, curl: [0, 0, 2] }),
  },
  {
    id: 'saddle', components: ['x', '-y', '0'],
    reference: ([x, y]) => ({ vector: [x, -y, 0], jacobian: [[1, 0, 0], [0, -1, 0], [0, 0, 0]], divergence: 0, curl: [0, 0, 0] }),
  },
  {
    id: 'custom-polynomial', fieldId: 'custom', components: ['x*y+z^2', 'x^2-y', 'z*x'],
    reference: ([x, y, z]) => ({ vector: [x * y + z ** 2, x ** 2 - y, z * x], jacobian: [[y, x, 2 * z], [2 * x, -1, 0], [z, 0, x]], divergence: y - 1 + x, curl: [0, z, x] }),
  },
  {
    id: 'custom-trigonometric', fieldId: 'custom', components: ['sin(x)*cos(y)', 'exp(z)', 'log(x+4)'],
    reference: ([x, y, z]) => ({
      vector: [Math.sin(x) * Math.cos(y), Math.exp(z), Math.log(x + 4)],
      jacobian: [[Math.cos(x) * Math.cos(y), -Math.sin(x) * Math.sin(y), 0], [0, 0, Math.exp(z)], [1 / (x + 4), 0, 0]],
      divergence: Math.cos(x) * Math.cos(y),
      curl: [-Math.exp(z), -1 / (x + 4), Math.sin(x) * Math.sin(y)],
    }),
  },
];

function toleranceFor(reference, mode) {
  // Catalog criteria retain MAT-01/MAT-02, rather than broadening their gates.
  if (!reference.fieldId) return mode === 'auto'
    ? { atol: 1e-12, rtol: 1e-12, source: 'VALIDATION.md MAT-01' }
    : { atol: 1e-8, rtol: 1e-8, source: 'VALIDATION.md MAT-02' };
  return mode === 'auto'
    ? { atol: 1e-10, rtol: 1e-8, source: 'Additional independent smooth-field checks' }
    : { atol: 1e-4, rtol: 1e-3, source: 'Additional independent smooth-field checks' };
}

function metric(size) {
  return {
    comparisons: 0,
    maxAbsoluteError: 0,
    maximumRelativeErrorAtNonzeroReference: 0,
    maximumToleranceRatio: 0,
    componentMaxAbsoluteErrors: Array(size).fill(0),
    worstAbsoluteError: null,
  };
}

async function main() {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const streamlineSource = 'evidence/streamline-errors.json';
  const streamlines = JSON.parse(await readFile(path.join(root, streamlineSource), 'utf8'));
  const server = await createServer({ root, configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true } });
  const failures = [];
  let failureCount = 0;
  const fail = (message, context = {}) => {
    failureCount++;
    if (failures.length < 100) failures.push({ message, ...context });
  };

  try {
    const { prepareField } = await server.ssrLoadModule('/src/math/engine.ts');
    const { catalog } = await server.ssrLoadModule('/src/math/catalog.ts');
    const { defaultConfig } = await server.ssrLoadModule('/src/experiment/defaults.ts');
    const results = [];
    let sampleCount = 0;
    let comparisonCount = 0;

    for (const reference of references) {
      if (!reference.fieldId) {
        const definition = catalog.find(field => field.id === reference.id);
        if (!definition || JSON.stringify(definition.components) !== JSON.stringify(reference.components)) {
          fail('Catalog components differ from the approved independent definition.', { field: reference.id });
        }
      }
      for (const mode of ['auto', 'finite']) {
        const config = defaultConfig();
        config.fieldId = reference.fieldId ?? reference.id;
        config.components = [...reference.components];
        config.parameters = reference.id === 'helix' ? { a: { value: 1, min: -3, max: 3, step: .1 } } : {};
        config.numerics.derivativeMethod = mode;
        config.numerics.eta = 1e-4;
        const tolerance = toleranceFor(reference, mode);
        const result = {
          field: reference.id, requestedMethod: mode, components: [...reference.components],
          parameters: structuredClone(config.parameters), domain: structuredClone(config.domain), eta: config.numerics.eta,
          pointCount: points.length, tolerance, methods: {},
          reliability: { reliable: 0, unreliable: 0, unavailable: 0 },
          invalidEvaluations: 0, largestReportedDerivativeError: 0,
          errors: { components: metric(3), norm: metric(1), jacobian: metric(9), divergence: metric(1), curl: metric(3) },
          passed: true,
        };
        const initialFailures = failureCount;
        const field = prepareField(config);

        function compare(name, actual, expected, point) {
          const values = result.errors[name];
          actual.forEach((value, component) => {
            values.comparisons++;
            comparisonCount++;
            if (!Number.isFinite(value) || !Number.isFinite(expected[component])) {
              fail('Comparison contains a non-finite value.', { field: reference.id, mode, quantity: name, component, point: [...point] });
              return;
            }
            const error = Math.abs(value - expected[component]);
            const limit = tolerance.atol + tolerance.rtol * Math.abs(expected[component]);
            values.componentMaxAbsoluteErrors[component] = Math.max(values.componentMaxAbsoluteErrors[component], error);
            values.maximumToleranceRatio = Math.max(values.maximumToleranceRatio, error / limit);
            if (expected[component] !== 0) {
              values.maximumRelativeErrorAtNonzeroReference = Math.max(values.maximumRelativeErrorAtNonzeroReference, error / Math.abs(expected[component]));
            }
            if (values.worstAbsoluteError === null || error > values.maxAbsoluteError) {
              values.maxAbsoluteError = error;
              values.worstAbsoluteError = { point: [...point], component, actual: value, reference: expected[component] };
            }
            if (error > limit) fail('Independent reference tolerance exceeded.', { field: reference.id, mode, quantity: name, component, point: [...point], actual: value, reference: expected[component], error, limit });
          });
        }

        for (const point of points) {
          sampleCount++;
          const expected = reference.reference(point);
          // This small bounded reference uses an independent sum-of-squares norm.
          const norm = Math.sqrt(expected.vector.reduce((sum, value) => sum + value * value, 0));
          const sample = field.sample(point);
          if (!sample.evaluation.valid) {
            result.invalidEvaluations++;
            fail('Smooth reference field produced an invalid evaluation.', { field: reference.id, mode, point: [...point], reason: sample.evaluation.reason, detail: sample.evaluation.message });
          } else {
            compare('components', sample.evaluation.vector, expected.vector, point);
            compare('norm', [sample.evaluation.norm], [norm], point);
          }
          const derivative = sample.derivative;
          result.methods[derivative.method] = (result.methods[derivative.method] ?? 0) + 1;
          if (!derivative.valid) {
            result.reliability.unavailable++;
            fail('Smooth reference derivative is unavailable.', { field: reference.id, mode, point: [...point], detail: derivative.message });
            continue;
          }
          result.reliability[derivative.reliable ? 'reliable' : 'unreliable']++;
          if (!derivative.reliable) fail('Smooth reference derivative is marked unreliable.', { field: reference.id, mode, point: [...point] });
          if (Number.isFinite(derivative.error)) result.largestReportedDerivativeError = Math.max(result.largestReportedDerivativeError, derivative.error);
          else fail('Derivative error estimate is not finite.', { field: reference.id, mode, point: [...point] });
          compare('jacobian', derivative.jacobian.flat(), expected.jacobian.flat(), point);
          compare('divergence', [derivative.divergence], [expected.divergence], point);
          compare('curl', derivative.curl, expected.curl, point);
        }
        result.passed = failureCount === initialFailures;
        results.push(result);
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      command: 'node scripts/math-report.mjs',
      purpose: 'Independent mathematical error evidence for the implemented engine; complements rather than reruns unit and streamline tests.',
      versions: { package: pkg.version, engine: defaultConfig().engineVersion, node: process.version, packageManager: pkg.packageManager, dependencies: pkg.dependencies, developmentDependencies: pkg.devDependencies },
      comparisonRule: 'abs(actual-reference) <= atol + rtol*abs(reference); no rounding before comparison',
      pointSet: { kind: 'Fixed Cartesian product', coordinates, pointsPerCase: points.length, domain: [[-3, -3, -3], [3, 3, 3]], helicoidalParameterA: 1 },
      jacobianOrdering: { rows: ['P', 'Q', 'R'], columns: ['x', 'y', 'z'], componentErrors: 'Flattened row-major order' },
      summary: { passed: failureCount === 0, fieldCount: references.length, caseCount: results.length, sampleCount, scalarComparisonCount: comparisonCount, failureCount },
      results,
      failures,
      failuresTruncated: failureCount > failures.length,
      existingEvidence: { unitSuite: 'evidence/h4-unit.json', streamlines: { source: streamlineSource, report: streamlines } },
      limitations: ['Additional curated fields do not certify arbitrary expressions or scales.', 'Unit-suite counts are intentionally left to the linked test report.', 'This script does not regenerate streamline or browser evidence.'],
    };
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`Saved evidence/math-final.json: ${results.length} cases, ${sampleCount} samples, ${comparisonCount} scalar comparisons, ${failureCount} failures.`);
    assert.equal(failureCount, 0, 'Mathematical checks failed; see evidence/math-final.json.');
  } finally {
    await server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
