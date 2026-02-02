# Contributing to glancey

Thank you for your interest in contributing to glancey! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 20.x or later
- npm 9.x or later
- Git

### Getting Started

1. Fork the repository and clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/glancey.git
   cd glancey
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your environment (optional, for testing with real embeddings):
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. Build the project:
   ```bash
   npm run build
   ```

5. Run tests:
   ```bash
   npm test
   ```

## Development Workflow

### Running in Development

```bash
npm run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run dev` | Run in development mode with tsx |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Check for ESLint errors |
| `npm run lint:fix` | Fix auto-fixable ESLint errors |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check code formatting |
| `npm run type-check` | Run TypeScript type checking |
| `npm run clean` | Remove build artifacts |

## Code Style Guidelines

### TypeScript

- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Use explicit return types for exported functions
- Avoid `any` - use `unknown` or proper typing instead

### Formatting

- Code is formatted with Prettier (run `npm run format`)
- ESLint enforces additional style rules

### Naming Conventions

- Files: kebab-case (`code-indexer.ts`)
- Classes: PascalCase (`CodeIndexer`)
- Functions/methods: camelCase (`indexCodebase`)
- Constants: SCREAMING_SNAKE_CASE (`MAX_CHUNK_SIZE`)

### Testing

- Write tests for new features and bug fixes
- Tests are located in `src/__tests__/`
- Use Vitest for testing
- Aim for meaningful test coverage

## Pull Request Process

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes, following the code style guidelines

3. Ensure all tests pass:
   ```bash
   npm test
   ```

4. Ensure linting passes:
   ```bash
   npm run lint
   ```

5. Commit your changes with a descriptive message:
   ```bash
   git commit -m "Add feature: description of changes"
   ```

6. Push to your fork and create a Pull Request

7. Ensure CI checks pass

### Commit Messages

- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move cursor to..." not "Moves cursor to...")
- Reference issues when applicable ("Fix #123: description")

## Reporting Issues

- Use GitHub Issues to report bugs or suggest features
- Include reproduction steps for bugs
- Include your Node.js version and OS

## License

By contributing, you agree that your contributions will be licensed under the GPL-3.0 license.
