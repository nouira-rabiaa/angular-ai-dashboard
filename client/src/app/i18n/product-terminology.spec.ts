import fr from './catalogs/fr.json';
import en from './catalogs/en.json';

function values(object: Record<string, unknown>): string[] {
  return Object.values(object).flatMap(value => typeof value === 'string' ? [value] : values(value as Record<string, unknown>));
}

describe('Product terminology', () => {
  it.each([['fr', fr], ['en', en]])('keeps internal roadmap identifiers out of %s display text', (_language, catalog) => {
    for (const value of values(catalog as Record<string, unknown>)) {
      expect(value).not.toMatch(/\bphases?\s+\d|\b5[A-G](?:-\d+)?\b/i);
    }
  });
  it('uses business names while preserving compatibility translation keys', () => {
    expect(fr.handoff.title).toBe('Transfert à un opérateur');
    expect(en.handoff.title).toBe('Human Handoff');
    expect(fr.knowledge.previsualisation_documentaire_5b).toBe('Prévisualisation documentaire');
    expect(en.configuration.enterprise_ai_dashboard_phases_5a_5b_5c).toBe('Enterprise AI Dashboard · Support Agent Studio');
  });
});
