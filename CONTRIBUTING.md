# Contributing to LLM API Bench

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Git

### Local Development

```bash
git clone https://github.com/idemerge/llm-api-bench.git
cd llm-benchmark
cp .env.example .env

# Backend (runs on port 3001)
cd backend && npm install && npm run dev &

# Frontend (runs on port 5173)
cd ../frontend && npm install && npm run dev
```

### Docker

```bash
cp .env.example .env
docker compose up -d
```

## Project Structure

```
├── backend/          # Express + TypeScript API server
│   ├── src/
│   │   ├── routes/       # API route handlers
│   │   ├── services/     # Business logic
│   │   └── database/     # SQLite schema & queries
│   └── package.json
├── frontend/         # React + Vite + TypeScript
│   ├── src/
│   │   ├── components/   # Shared UI components
│   │   ├── pages/        # Page-level components
│   │   └── services/     # API client
│   └── package.json
├── docker-compose.yml
├── Dockerfile
└── start.sh
```

## How to Contribute

### Reporting Bugs

1. Search [existing issues](https://github.com/idemerge/llm-api-bench/issues) first
2. Use the **Bug Report** issue template
3. Include steps to reproduce, expected vs actual behavior, and screenshots if applicable

### Suggesting Features

1. Open an issue using the **Feature Request** template
2. Describe the use case and why it would be useful

### Submitting Code

1. Fork the repository
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```
3. Make your changes — follow the coding conventions below
4. Test your changes locally
5. Commit with a descriptive message:
   ```bash
   git commit -m "feat: add support for X"
   ```
6. Push and open a Pull Request against `main`

## Coding Conventions

- **Language**: All code, comments, and commit messages in English
- **Commit style**: [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `style:`, `ci:`
- **Frontend**: React functional components, TypeScript strict mode, Tailwind CSS for styling
- **Backend**: Express routes → service layer → database. Raw SQL with `better-sqlite3`, no ORM
- **Formatting**: Follow the existing code style in each file

## Adding a New Provider Adapter

LLM API Bench supports adding custom LLM providers. To add one:

1. Create a new adapter in `backend/src/services/` following the existing pattern (see `openai-adapter` as reference)
2. Implement the standard interface: `chat`, `chatStream`, `listModels`
3. Register the adapter in the provider factory
4. Add the provider option to the frontend settings page

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
