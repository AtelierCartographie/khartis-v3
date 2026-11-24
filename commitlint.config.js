const AI_ATTRIBUTION =
  /^\s*(?:co-authored-by:.*(?:claude|anthropic)|claude-session:|.*generated with \[?claude code)/im;

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'no-ai-attribution': ({ raw }) => [
          !AI_ATTRIBUTION.test(raw ?? ''),
          'remove the line that credits an AI assistant (co-author trailer or session link)'
        ]
      }
    }
  ],
  rules: {
    'no-ai-attribution': [2, 'always']
  }
};
