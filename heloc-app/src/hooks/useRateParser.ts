import { useState, useCallback } from 'react';
import type { RatesData } from '../types';

export type RateSource = 'figure' | 'niftydoor' | 'unknown';

export interface ParsedRates {
  tier1: {
    fixed: { [term: number]: number };
    variable: { [term: number]: number };
    origination: number;
  };
  tier2: {
    fixed: { [term: number]: number };
    variable: { [term: number]: number };
    origination: number;
  };
  tier3: {
    fixed: { [term: number]: number };
    variable: { [term: number]: number };
    origination: number;
  };
}

export const useRateParser = () => {
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectSource = useCallback((text: string): RateSource => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('figure') || lowerText.includes('fig.')) return 'figure';
    if (lowerText.includes('nifty') || lowerText.includes('niftydoor')) return 'niftydoor';
    return 'unknown';
  }, []);

  const parseFigureRates = useCallback((text: string): Partial<ParsedRates> | null => {
    try {
      // Figure rate sheet patterns
      const rates: Partial<ParsedRates> = {
        tier1: { fixed: {}, variable: {}, origination: 2.0 },
        tier2: { fixed: {}, variable: {}, origination: 1.5 },
        tier3: { fixed: {}, variable: {}, origination: 0.0 },
      };

      // Look for tier headers and rates
      const tier1Match = text.match(/tier\s*1.*?([\d.]+)%/i);
      const tier2Match = text.match(/tier\s*2.*?([\d.]+)%/i);
      const tier3Match = text.match(/tier\s*3.*?([\d.]+)%/i);

      // Look for term-specific rates
      // Term detection for future use
      // const term30Match = text.match(/30\s*(?:year|yr)?.*?(?:fixed)?.*?([\d.]+)%/i);
      // const term20Match = text.match(/20\s*(?:year|yr)?.*?(?:fixed)?.*?([\d.]+)%/i);
      // const term15Match = text.match(/15\s*(?:year|yr)?.*?(?:fixed)?.*?([\d.]+)%/i);
      // const term10Match = text.match(/10\s*(?:year|yr)?.*?(?:fixed)?.*?([\d.]+)%/i);

      // Look for origination points
      const origMatch = text.match(/origination.*?([\d.]+)%/i);
      if (origMatch) {
        const orig = parseFloat(origMatch[1]);
        if (!isNaN(orig)) {
          rates.tier1!.origination = orig;
          rates.tier2!.origination = orig * 0.75; // Estimate
          rates.tier3!.origination = 0;
        }
      }

      // Extract rates by looking for patterns like "5.125%" near tier mentions
      const rateMatches = text.matchAll(/([\d.]+)%/g);
      const allRates = Array.from(rateMatches).map(m => parseFloat(m[1]));
      
      if (allRates.length >= 3) {
        // Sort and assign to tiers (lowest = tier 1, highest = tier 3)
        const sortedRates = [...new Set(allRates)].sort((a, b) => a - b);
        
        if (sortedRates.length >= 3) {
          // Assign to terms (this is a simplified approach)
          [30, 20, 15, 10].forEach((term) => {
            rates.tier1!.fixed[term] = sortedRates[0];
            rates.tier2!.fixed[term] = sortedRates[Math.min(1, sortedRates.length - 1)];
            rates.tier3!.fixed[term] = sortedRates[Math.min(2, sortedRates.length - 1)];
          });
        }
      }

      // If we found specific tier matches, use those
      if (tier1Match) rates.tier1!.fixed[30] = parseFloat(tier1Match[1]);
      if (tier2Match) rates.tier2!.fixed[30] = parseFloat(tier2Match[1]);
      if (tier3Match) rates.tier3!.fixed[30] = parseFloat(tier3Match[1]);

      return rates;
    } catch (err) {
      console.error('Error parsing Figure rates:', err);
      return null;
    }
  }, []);

  const parseNiftyDoorRates = useCallback((text: string): Partial<ParsedRates> | null => {
    try {
      // Nifty Door format patterns
      const rates: Partial<ParsedRates> = {
        tier1: { fixed: {}, variable: {}, origination: 2.0 },
        tier2: { fixed: {}, variable: {}, origination: 1.5 },
        tier3: { fixed: {}, variable: {}, origination: 0.0 },
      };

      // Nifty Door often shows rates in a table format
      // Look for patterns like "5.125%" or "Rate: 5.125%"
      const ratePattern = /rate[:\s]+([\d.]+)%/gi;
      const matches = Array.from(text.matchAll(ratePattern));
      
      if (matches.length >= 3) {
        const extractedRates = matches.map(m => parseFloat(m[1]));
        
        // Assign to tiers and terms
        [30, 20, 15, 10].forEach((term) => {
          rates.tier1!.fixed[term] = extractedRates[0] || 5.5;
          rates.tier2!.fixed[term] = extractedRates[1] || 6.5;
          rates.tier3!.fixed[term] = extractedRates[2] || 7.5;
        });
      }

      // Look for pricing adjustments
      const adjustmentMatch = text.match(/pricing\s*adjustment[:\s]+([\d.]+)/i);
      if (adjustmentMatch) {
        const adjustment = parseFloat(adjustmentMatch[1]);
        // Apply adjustment to base rates
        [30, 20, 15, 10].forEach(term => {
          if (rates.tier1?.fixed[term]) rates.tier1.fixed[term] += adjustment;
          if (rates.tier2?.fixed[term]) rates.tier2.fixed[term] += adjustment;
          if (rates.tier3?.fixed[term]) rates.tier3.fixed[term] += adjustment;
        });
      }

      return rates;
    } catch (err) {
      console.error('Error parsing Nifty Door rates:', err);
      return null;
    }
  }, []);

  const parseRates = useCallback((text: string, source?: RateSource): { rates: Partial<ParsedRates> | null; detectedSource: RateSource } => {
    setIsParsing(true);
    setError(null);

    try {
      const detectedSource = source || detectSource(text);
      let rates: Partial<ParsedRates> | null = null;

      switch (detectedSource) {
        case 'figure':
          rates = parseFigureRates(text);
          break;
        case 'niftydoor':
          rates = parseNiftyDoorRates(text);
          break;
        default:
          // Try both parsers
          rates = parseFigureRates(text) || parseNiftyDoorRates(text);
          break;
      }

      if (!rates) {
        setError('Could not parse rates. Please check the format and try again.');
      }

      return { rates, detectedSource };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error parsing rates');
      return { rates: null, detectedSource: 'unknown' };
    } finally {
      setIsParsing(false);
    }
  }, [detectSource, parseFigureRates, parseNiftyDoorRates]);

  const applyParsedRates = useCallback((parsedRates: Partial<ParsedRates>): RatesData => {
    const defaultRates: RatesData = {
      tier1: {
        origination: 2.0,
        fixed: { 30: 5.5, 20: 5.375, 15: 5.25, 10: 5.125 },
        variable: { 30: 6.0, 20: 5.875, 15: 5.75, 10: 5.625 },
      },
      tier2: {
        origination: 1.5,
        fixed: { 30: 6.5, 20: 6.375, 15: 6.25, 10: 6.125 },
        variable: { 30: 7.0, 20: 6.875, 15: 6.75, 10: 6.625 },
      },
      tier3: {
        origination: 0.0,
        fixed: { 30: 7.5, 20: 7.375, 15: 7.25, 10: 7.125 },
        variable: { 30: 8.0, 20: 7.875, 15: 7.75, 10: 7.625 },
      },
    };

    if (!parsedRates) return defaultRates;

    return {
      tier1: {
        ...defaultRates.tier1,
        ...parsedRates.tier1,
        fixed: { ...defaultRates.tier1.fixed, ...parsedRates.tier1?.fixed },
      },
      tier2: {
        ...defaultRates.tier2,
        ...parsedRates.tier2,
        fixed: { ...defaultRates.tier2.fixed, ...parsedRates.tier2?.fixed },
      },
      tier3: {
        ...defaultRates.tier3,
        ...parsedRates.tier3,
        fixed: { ...defaultRates.tier3.fixed, ...parsedRates.tier3?.fixed },
      },
    };
  }, []);

  return {
    parseRates,
    applyParsedRates,
    detectSource,
    isParsing,
    error,
  };
};
