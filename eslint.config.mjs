import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import eslintConfigPrettier from 'eslint-config-prettier'

const eslintConfig = [
  ...nextCoreWebVitals,
  eslintConfigPrettier,
  {
    rules: {
      // Downgrade new React 19 strict rules to warnings — fix incrementally
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
]

export default eslintConfig
