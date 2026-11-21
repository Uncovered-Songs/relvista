import { createContext, useContext } from 'react';
import { colorResolver, type ColorResolver } from '../theme.js';

/** Colour spelling for the SVG components (CSS variables with fallbacks, or literal colours). */
export const ColorContext = createContext<ColorResolver>(colorResolver('light'));

/** The `ColorResolver` of the enclosing `ColorContext` (CSS variables in light mode by default). */
export function useColors(): ColorResolver {
  return useContext(ColorContext);
}
