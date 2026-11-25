module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx,cjs}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Jest uses CommonJS; exercise Lucide's real CJS build rather than its .mjs entry.
    '^lucide-react-native/icons/(.*)$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
  },
};
