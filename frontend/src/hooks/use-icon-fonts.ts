// Expo vector icons are available without an explicit font-loading gate in this app.
// Returning "ready" immediately keeps Expo Go from getting stuck on startup.

export const useIconFonts = (): readonly [boolean, Error | null] => [true, null];
