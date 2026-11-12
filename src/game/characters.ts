/**
 * characters.ts — data-driven character catalogue for ARCHi Go.
 * Built-in characters use lightweight procedural meshes. Optional GLB/GLTF
 * models can be supplied by adding modelUrl to a definition.
 */

export interface CharacterDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  bodyColor: number;
  accentColor: number;
  eyeColor: number;
  modelUrl?: string;
  unlockedByDefault: boolean;
}

export const CHARACTERS: CharacterDefinition[] = [
  {
    id: "puff",
    name: "Puff",
    description: "The cheerful all-rounder. Ready for every island.",
    icon: "☁️",
    bodyColor: 0xfff1f5,
    accentColor: 0xffa9c2,
    eyeColor: 0x30222e,
    unlockedByDefault: true,
  },
  {
    id: "fox",
    name: "Flick",
    description: "A curious fox with a bright orange coat.",
    icon: "🦊",
    bodyColor: 0xf28b35,
    accentColor: 0xffd18a,
    eyeColor: 0x30222e,
    unlockedByDefault: true,
  },
  {
    id: "bot",
    name: "Byte",
    description: "A friendly little bot built for big adventures.",
    icon: "🤖",
    bodyColor: 0x9eafc2,
    accentColor: 0x55d9e8,
    eyeColor: 0x163d57,
    unlockedByDefault: true,
  },
  {
    id: "penguin",
    name: "Pip",
    description: "A brave penguin who never skips a hop.",
    icon: "🐧",
    bodyColor: 0x27364e,
    accentColor: 0xffc65c,
    eyeColor: 0x18202d,
    unlockedByDefault: true,
  },
];

export const DEFAULT_CHARACTER_ID = "puff";

export function getCharacter(id: string): CharacterDefinition {
  return CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];
}
