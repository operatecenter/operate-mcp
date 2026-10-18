# Contributing to `operate-mcp`

Thank you for contributing to the Operate.Center MCP Server!

## Development Workflow

1. Fork and clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build TypeScript:
   ```bash
   npm run build
   ```
4. Test with the MCP Inspector or your local agent client:
   ```bash
   OPERATE_API_KEY=agt_test_key node dist/index.js
   ```

## Pull Request Guidelines

- Keep tool schemas clean, well-typed, and backwards-compatible.
- Never commit `.env` files or live API keys.
- Ensure `npm run build` completes with zero TypeScript errors before opening a PR.
