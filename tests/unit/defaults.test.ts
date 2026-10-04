import { describe, expect, it } from 'vitest';
import { defaultConfig, generateSeeds } from '../../src/experiment/defaults';
describe('base reproducible',()=>{it('conserva escala, campo inicial y semillas deterministas interiores',()=>{const config=defaultConfig();expect(config.components).toEqual(['-y','x','0']);expect(config.resolution).toBe(9);expect(generateSeeds(config.domain)).toEqual(config.seeds);expect(config.seeds).toHaveLength(16);config.seeds.forEach(p=>p.forEach(x=>expect(Math.abs(x)).toBeLessThanOrEqual(2.4)));});});
