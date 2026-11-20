import { createContext, useContext } from 'react';
import { colorResolver, type ColorResolver } from '../theme.js';

/** Colour spelling for the SVG components (CSS variables with fallbacks, or literal colours). */
export const ColorContext = createContext<ColorResolver>(colorResolver('light'));

export function useColors(): ColorResolver {
  return useContext(ColorContext);
}
