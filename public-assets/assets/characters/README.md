# ARCHi Go character models

Place optional custom character models in this directory and set the matching
`modelUrl` in `src/game/characters.ts`.

Example:

```ts
{
  id: "fox",
  // ...other character properties
  modelUrl: "/assets/characters/fox.glb",
}
```

Recommended model requirements:

- GLB or glTF 2.0 format.
- Character faces local `-Z` (the game's forward direction).
- One character per file, centered horizontally at the origin.
- Feet near local Y=0; the loader normalizes the model to about 0.95 game units tall.
- Keep model complexity and texture sizes suitable for mobile browsers.
- Include animation clips with names containing `idle`, `run` or `walk`, `jump`, `fall`, and optionally `land`.

If `modelUrl` is omitted or the model fails to load, the built-in procedural
character remains available as a fallback. The collision box and movement
physics are independent of the visual model.
