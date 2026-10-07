module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
  // TS source uses NodeNext-style relative imports with an explicit ".js"
  // suffix (required for the real build output), e.g. `from "./github.js"`.
  // Jest's resolver looks for a literal github.js file and fails, since we
  // run against the .ts sources directly. Strip the suffix so it resolves
  // the real .ts module instead — standard ts-jest + NodeNext ESM fix.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
