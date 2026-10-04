import type {
  DerivativeResult,
  ExperimentConfigV1,
  FieldDefinition,
  FieldId,
  FieldSample,
  Parameters,
  Vec3,
} from '../experiment/types';

/** Referencias cerradas del catálogo: independientes del motor de derivación. */
const operators: Record<Exclude<FieldId, 'custom'>, { divergence: number; curl: Vec3 }> = {
  uniform: { divergence: 0, curl: [0, 0, 0] },
  outward: { divergence: 3, curl: [0, 0, 0] },
  inward: { divergence: -3, curl: [0, 0, 0] },
  rotation: { divergence: 0, curl: [0, 0, 2] },
  helix: { divergence: 0, curl: [0, 0, 2] },
  saddle: { divergence: 0, curl: [0, 0, 0] },
};

export const catalog: FieldDefinition[] = [
  {
    id: 'uniform',
    name: 'Uniforme',
    subtitle: 'Dirección constante',
    components: ['1', '0', '0'],
    parameters: {},
    equilibrium: 'Ninguno.',
    description: 'Vectores paralelos de igual magnitud. Las líneas son rectas paralelas al eje x y se orientan hacia +x. Referencia para dirección constante e integración.',
    evaluate: () => [1, 0, 0],
    jacobian: () => [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
  },
  {
    id: 'outward',
    name: 'Radial saliente',
    subtitle: 'Expansión local',
    components: ['x', 'y', 'z'],
    parameters: {},
    equilibrium: 'El origen (0, 0, 0).',
    description: 'La magnitud es proporcional a la distancia al origen. Las líneas son semirrectas orientadas hacia fuera: expansión local sin giro.',
    evaluate: ([x, y, z]) => [x, y, z],
    jacobian: () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  },
  {
    id: 'inward',
    name: 'Radial entrante',
    subtitle: 'Contracción local',
    components: ['-x', '-y', '-z'],
    parameters: {},
    equilibrium: 'El origen (0, 0, 0).',
    description: 'La magnitud es proporcional a la distancia al origen. Las líneas son semirrectas orientadas hacia el origen: contracción local sin giro.',
    evaluate: ([x, y, z]) => [-x, -y, -z],
    jacobian: () => [[-1, 0, 0], [0, -1, 0], [0, 0, -1]],
  },
  {
    id: 'rotation',
    name: 'Rotacional',
    subtitle: 'Giro sin divergencia',
    components: ['-y', 'x', '0'],
    parameters: {},
    equilibrium: 'Todo el eje z: x = y = 0.',
    description: 'Las líneas son circunferencias en planos z constante. El giro es antihorario visto desde +z, con rotacional (0, 0, 2) y divergencia nula.',
    evaluate: ([x, y]) => [-y, x, 0],
    jacobian: () => [[0, -1, 0], [1, 0, 0], [0, 0, 0]],
  },
  {
    id: 'helix',
    name: 'Helicoidal',
    subtitle: 'Giro y avance axial',
    components: ['-y', 'x', 'a'],
    parameters: { a: { value: 1, min: -3, max: 3, step: 0.1 } },
    equilibrium: 'Ninguno si a ≠ 0; todo el eje z si a = 0.',
    description: 'Fuera del eje z, las líneas son hélices de radio constante. Sobre el eje son rectas si a ≠ 0. El avance vertical por vuelta es 2πa: sube si a > 0 y baja si a < 0. Para a = 0 coincide con el campo rotacional.',
    evaluate: ([x, y], values) => [-y, x, values.a ?? 1],
    jacobian: () => [[0, -1, 0], [1, 0, 0], [0, 0, 0]],
  },
  {
    id: 'saddle',
    name: 'Silla',
    subtitle: 'Deformación sin giro',
    components: ['x', '-y', '0'],
    parameters: {},
    equilibrium: 'Todo el eje z: x = y = 0.',
    description: 'Expansión en x, contracción en y y z constante. Las curvas conservan xy. La divergencia nula no implica un campo constante ni ausencia de deformación.',
    evaluate: ([x, y]) => [x, -y, 0],
    jacobian: () => [[1, 0, 0], [0, -1, 0], [0, 0, 0]],
  },
];

export function getField(id: FieldId | string): FieldDefinition | undefined {
  return catalog.find((field) => field.id === id);
}

export function parameterValues(parameters: Parameters): Record<string, number> {
  return Object.fromEntries(
    Object.entries(parameters).map(([name, parameter]) => [name, parameter.value]),
  );
}

export function analyticSample(config: ExperimentConfigV1, point: Vec3): FieldSample {
  const location: Vec3 = [...point];
  const field = getField(config.fieldId);
  if (!field) {
    return {
      point: location,
      evaluation: { valid: false, reason: 'undefined', message: 'Este campo no tiene una referencia analítica en el catálogo.' },
      derivative: { valid: false, method: 'unavailable', message: 'Referencia analítica no disponible.' },
    };
  }
  if (!point.every(Number.isFinite)) {
    return {
      point: location,
      evaluation: { valid: false, reason: 'non-finite', message: 'Las coordenadas deben ser números reales finitos.' },
      derivative: { valid: false, method: 'unavailable', message: 'No se evalúan derivadas en coordenadas no finitas.' },
    };
  }
  const values = parameterValues(config.parameters);
  const vector = field.evaluate(point, values);
  const norm = Math.hypot(...vector);
  if (!vector.every(Number.isFinite) || !Number.isFinite(norm)) {
    return {
      point: location,
      evaluation: { valid: false, reason: 'non-finite', message: 'El campo no produce un vector y una magnitud finitos en este punto.' },
      derivative: { valid: false, method: 'unavailable', message: 'No se evalúan derivadas de un campo no finito.' },
    };
  }
  const reference = operators[field.id];
  const derivative: DerivativeResult = {
    valid: true,
    jacobian: field.jacobian(point, values),
    divergence: reference.divergence,
    curl: [...reference.curl],
    method: 'analytic',
    error: 0,
    reliable: true,
  };
  return { point: location, evaluation: { valid: true, vector, norm }, derivative };
}

/** Malla cartesiana reproducible; incluye los extremos de cada intervalo. */
export function sampleCatalog(config: ExperimentConfigV1): FieldSample[] {
  const count = config.resolution;
  const coordinates = config.domain[0].map((lower, axis) =>
    Array.from({ length: count }, (_, index) => index === count - 1
      ? config.domain[1][axis]
      : lower + (config.domain[1][axis] - lower) * index / (count - 1)),
  );
  const samples: FieldSample[] = [];
  for (const x of coordinates[0]) {
    for (const y of coordinates[1]) {
      for (const z of coordinates[2]) samples.push(analyticSample(config, [x, y, z]));
    }
  }
  return samples;
}
