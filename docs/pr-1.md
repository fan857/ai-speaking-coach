# PR 1: Project Initialization and Frontend MVP Skeleton

## What Changed

- Created the initial repository structure for frontend, backend, docs, and root README.
- Added a React + Vite frontend with a single MVP practice page.
- Added an Express backend with `GET /api/health`.
- Added mock interaction data for the first speaking practice flow.

## Why

The first PR should only establish a runnable foundation and a visible product shape. It avoids real AI APIs and real speech integrations so the core interaction can be demonstrated early and improved in later PRs.

## Core Approach

- Keep frontend state local to `App.jsx`.
- Use scenario-specific mock responses for interview, restaurant ordering, and meeting practice.
- Keep backend minimal with one health endpoint.
- Document setup and current limitations in the root README.

## How To Test

1. Run `npm run install:all`.
2. Run `npm run dev:frontend` and open `http://localhost:5173`.
3. Type a sentence and submit the mock speech.
4. Run `npm run dev:backend`.
5. Open `http://localhost:3001/api/health`.
