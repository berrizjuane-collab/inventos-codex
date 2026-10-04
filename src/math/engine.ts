import {
  derivative as symbolicDerivative,
  parse,
  type ConstantNode,
  type EvalFunction,
  type FunctionNode,
  type MathNode,
  type OperatorNode,
  type SymbolNode,
} from 'mathjs';
import type {
  Components,
  DerivativeResult,
  EvaluationResult,
  ExperimentConfigV1,
  FieldSample,
  Vec3,
} from '../experiment/types';
import { finiteDifference } from '../numerics/finiteDifference';
import { analyticSample, getField } from './catalog';

type ParameterName = 'a' | 'b' | 'c';
export interface ValidationResult {
  ok: boolean;
  errors: { component: number; message: string }[];
  usedParameters: ParameterName[];
}
export interface PreparedField {
  evaluate(point: Vec3): EvaluationResult;
  derivative(point: Vec3): DerivativeResult;
  sample(point: Vec3): FieldSample;
  usedParameters: ParameterName[];
}

const parameterNames: ParameterName[] = ['a', 'b', 'c'];
const variables = new Set(['x', 'y', 'z', 'a', 'b', 'c', 'pi', 'e']);
const functions = new Set(['sin', 'cos', 'tan', 'exp', 'log', 'sqrt']);
const binaryOperators = new Map([['add', '+'], ['subtract', '-'], ['multiply', '*'], ['divide', '/'], ['pow', '^']]);
const unaryOperators = new Map([['unaryPlus', '+'], ['unaryMinus', '-']]);

/** Recorre también los nombres de función: forman parte del presupuesto AST. */
function inspectTree(root: MathNode, maxNodes: number, maxDepth: number, validate?: (node: MathNode, parent?: MathNode) => void): void {
  const pending: { node: MathNode; depth: number; parent?: MathNode }[] = [{ node: root, depth: 1 }];
  let count = 0;
  while (pending.length) {
    const { node, depth, parent } = pending.pop()!;
    if (++count > maxNodes) throw new Error(`La expresión supera el límite de ${maxNodes} nodos.`);
    if (depth > maxDepth) throw new Error(`La expresión supera la profundidad máxima de ${maxDepth}.`);
    validate?.(node, parent);
    node.forEach((child) => pending.push({ node: child, depth: depth + 1, parent: node }));
  }
}

function parseComponents(components: Components): ValidationResult & { nodes: MathNode[] } {
  const errors: ValidationResult['errors'] = [];
  const used = new Set<ParameterName>();
  const nodes: MathNode[] = [];
  components.forEach((expression, component) => {
    try {
      if (typeof expression !== 'string' || !expression.trim()) throw new Error('Escribe una expresión para esta componente.');
      if (expression.length > 256) throw new Error('Cada componente admite como máximo 256 caracteres.');
      if (!/^[0-9A-Za-z+\-*/^().\s]*$/.test(expression)) throw new Error('Solo se admiten números, símbolos, operadores + − * / ^ y paréntesis.');
      const node = parse(expression);
      inspectTree(node, 128, 24, (item, parent) => {
        switch (item.type) {
          case 'ConstantNode': {
            const value = (item as ConstantNode).value;
            if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Las constantes numéricas deben ser reales finitas.');
            break;
          }
          case 'SymbolNode': {
            const name = (item as SymbolNode).name;
            const isFunctionName = parent?.type === 'FunctionNode' && (parent as FunctionNode).fn === item;
            if (isFunctionName) {
              if (!functions.has(name)) throw new Error(`Función no admitida: ${name}.`);
            } else {
              if (!variables.has(name)) throw new Error(`Símbolo no admitido: ${name}.`);
              if (parameterNames.includes(name as ParameterName)) used.add(name as ParameterName);
            }
            break;
          }
          case 'OperatorNode': {
            const operation = item as OperatorNode;
            if (operation.implicit) throw new Error('Escribe la multiplicación explícitamente con *, por ejemplo 2*x.');
            const permitted = operation.args.length === 1 ? unaryOperators : operation.args.length === 2 ? binaryOperators : undefined;
            if (permitted?.get(operation.fn) !== operation.op) throw new Error(`Operador no admitido: ${operation.op}.`);
            break;
          }
          case 'FunctionNode': {
            const functionNode = item as FunctionNode;
            if (functionNode.fn.type !== 'SymbolNode' || !functions.has(functionNode.fn.name)) throw new Error('Solo se admiten sin, cos, tan, exp, log y sqrt.');
            if (functionNode.args.length !== 1) throw new Error('Cada función admite exactamente un argumento.');
            break;
          }
          case 'ParenthesisNode': break;
          default: throw new Error(`Construcción no admitida: ${item.type}.`);
        }
      });
      nodes[component] = node;
    } catch (error) {
      const raw=error instanceof Error?error.message:'';const syntax=/Unexpected|expected|Value expected|Parenthesis|End of|Unknown character/i.test(raw);const position=raw.match(/char\s+(\d+)/i)?.[1];errors.push({ component, message: syntax ? `Sintaxis no válida: revisa los paréntesis, operadores y operandos.${position?` (posición ${position})`:''}` : raw||'No se pudo analizar la expresión.' });
    }
  });
  return { ok: errors.length === 0, errors, usedParameters: parameterNames.filter((name) => used.has(name)), nodes };
}

export function validateComponents(components: Components): ValidationResult {
  const { ok, errors, usedParameters } = parseComponents(components);
  return { ok, errors, usedParameters };
}

function unavailable(message: string): DerivativeResult {
  return { valid: false, method: 'unavailable', message };
}

function operators(jacobian: [Vec3, Vec3, Vec3]): { divergence: number; curl: Vec3 } {
  const [p, q, r] = jacobian;
  return { divergence: p[0] + q[1] + r[2], curl: [r[1] - q[2], p[2] - r[0], q[0] - p[1]] };
}

function invalidScalar(value: unknown): EvaluationResult | undefined {
  if (typeof value === 'object' && value !== null && 'isComplex' in value && value.isComplex === true) {
    return { valid: false, reason: 'complex', message: 'La expresión produce un resultado complejo en este punto.' };
  }
  if (typeof value !== 'number') return { valid: false, reason: 'undefined', message: 'La expresión no produce un escalar real.' };
  if (!Number.isFinite(value)) return { valid: false, reason: 'non-finite', message: 'La expresión produce un resultado no finito en este punto.' };
  return undefined;
}

export function prepareField(config: ExperimentConfigV1): PreparedField {
  // La revisión preparada conserva sus valores aunque el borrador siga cambiando.
  const applied = structuredClone(config);
  const validation = parseComponents(applied.components);
  const baseScope = new Map<string, number>([['pi', Math.PI], ['e', Math.E]]);
  for (const name of validation.usedParameters) {
    const parameter = applied.parameters[name];
    if (parameter) baseScope.set(name, parameter.value);
  }
  const scopeFor = ([x, y, z]: Vec3) => new Map<string, number>([...baseScope, ['x', x], ['y', y], ['z', z]]);
  const compiled: EvalFunction[] = [];
  let preparationError: string | undefined;
  if (validation.ok) {
    try { validation.nodes.forEach((node) => compiled.push(node.compile())); }
    catch { preparationError = 'No se pudo preparar la expresión.'; }
  }
  const evaluate = (point: Vec3): EvaluationResult => {
    if (!validation.ok || preparationError) return { valid: false, reason: 'undefined', message: preparationError ?? validation.errors.map((error) => error.message).join(' ') };
    if (!point.every(Number.isFinite)) return { valid: false, reason: 'non-finite', message: 'Las coordenadas deben ser números reales finitos.' };
    if (validation.usedParameters.some((name) => !baseScope.has(name))) return { valid: false, reason: 'undefined', message: 'Falta un valor para uno de los parámetros utilizados.' };
    if (validation.usedParameters.some((name) => !Number.isFinite(baseScope.get(name)))) return { valid: false, reason: 'non-finite', message: 'Los parámetros deben ser números reales finitos.' };
    try {
      const scope = scopeFor(point);
      const vector: Vec3 = [0, 0, 0];
      for (let component = 0; component < 3; component++) {
        const value: unknown = compiled[component].evaluate(scope);
        const invalid = invalidScalar(value);
        if (invalid) return invalid;
        vector[component] = value as number;
      }
      const norm = Math.hypot(...vector);
      if (!Number.isFinite(norm)) return { valid: false, reason: 'non-finite', message: 'La magnitud del vector no es finita.' };
      return { valid: true, vector, norm };
    } catch {
      return { valid: false, reason: 'undefined', message: 'La expresión no está definida en este punto.' };
    }
  };

  const definition = getField(applied.fieldId);
  const exactCatalog = applied.numerics.derivativeMethod === 'auto'
    && definition?.components.every((component, index) => component === applied.components[index]);
  let derivatives: EvalFunction[][] | undefined;
  if (validation.ok && !preparationError && !exactCatalog && applied.numerics.derivativeMethod === 'auto') {
    try {
      const started = performance.now();
      derivatives = validation.nodes.map((node) => ['x', 'y', 'z'].map((axis) => {
        if (performance.now() - started > 75) throw new Error('Presupuesto de derivación simbólica agotado.');
        const derived = symbolicDerivative(node, axis, { simplify: false });
        inspectTree(derived, 512, 128);
        if (performance.now() - started > 75) throw new Error('Presupuesto de derivación simbólica agotado.');
        return derived.compile();
      }));
    } catch { derivatives = undefined; }
  }
  const deriveValid = (point: Vec3): DerivativeResult => {
    if (exactCatalog) return analyticSample(applied, point).derivative;
    if (derivatives) {
      try {
        const scope = scopeFor(point);
        const jacobian = derivatives.map((row) => row.map((entry) => entry.evaluate(scope))) as [Vec3, Vec3, Vec3];
        if (jacobian.every((row) => row.every((entry) => typeof entry === 'number' && Number.isFinite(entry)))) {
          const values = operators(jacobian);
          if (Number.isFinite(values.divergence) && values.curl.every(Number.isFinite)) {
            return { valid: true, jacobian, ...values, method: 'symbolic', error: 0, reliable: true };
          }
        }
      } catch { /* Una derivada simbólica no disponible permite el stencil central. */ }
    }
    return finiteDifference(evaluate, point, applied.domain, applied.numerics.eta);
  };
  const derivative = (point: Vec3): DerivativeResult => {
    const original = evaluate(point);
    return original.valid ? deriveValid(point) : unavailable(`Derivada no disponible: ${original.message}`);
  };
  return {
    evaluate,
    derivative,
    sample(point) {
      const evaluation = evaluate(point);
      return { point: [...point], evaluation, derivative: evaluation.valid ? deriveValid(point) : unavailable(`Derivada no disponible: ${evaluation.message}`) };
    },
    usedParameters: [...validation.usedParameters],
  };
}
