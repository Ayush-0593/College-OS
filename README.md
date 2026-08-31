# College OS

> Everything you need to survive college, in one app.

College OS is a single student command center that replaces scattered ERP portals, WhatsApp groups, Google Classroom, email, and PDFs with one app. The killer feature is **"Ask My College"** — an AI assistant that answers questions using only the student's own retrieved data (controlled retrieval, never raw DB rows or other students' records).

This repository contains the **AI / document intelligence layer** of College OS: a Next.js 14 app that turns a student's uploaded PDFs and notes into searchable, citable context for the assistant.

## Tech stack

- **Next.js 14** (App Router) — full-stack in one codebase, server + client components
- **Prisma 5** + SQLite (swappable to Postgres later) — `schema.prisma` in `prisma/`
- **Tailwind CSS** with a custom brand palette
- **JWT** in httpOnly cookies (`jose` for Edge middleware, `jsonwebtoken` for Node API routes)
- **bcryptjs** for password hashing
- **PDF parsing** — `pdf-parse` for digital PDFs, `tesseract.js` for scanned/OCR fallback
- **Local embeddings** — `@xenova/transformers` runs an embedding model in-process (no external API for the indexing path)
- **Anthropic Claude** — `@anthropic-ai/sdk` for the final answer-generation step, with prompt caching

## Project structure

```
.
├── prisma/
│   ├── schema.prisma      # User, Document, DocumentChunk, …
│   └── seed.ts            # Demo data
├── src/
│   ├── app/               # App Router routes (UI + API)
│   ├── components/        # Shared UI
│   └── lib/               # Auth, db, retrieval, prompt assembly
├── uploads/               # User-uploaded files (gitignored)
├── instrumentation.ts     # Next.js runtime hooks
└── package.json
```

## Getting started

### Prerequisites

- Node.js 18.17+ (Next 14 requirement)
- npm

### Setup

```bash
# 1. Install dependencies (also runs `prisma generate` via postinstall)
npm install

# 2. Create the database schema
npm run db:push

# 3. (Optional) Seed demo data
npm run db:seed

# 4. Start the dev server
npm run dev
```

Open http://localhost:3000.

### Environment

Create a `.env` file in the project root:

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="<long random string — rotate before deploying>"
ANTHROPIC_API_KEY="<your key>"   # required for Ask My College answers
```

`.env` is gitignored. **Never commit it.**

## How Ask My College works

1. **Upload** a PDF or note in the Documents tab.
2. **Parse** — text is extracted (`pdf-parse` for digital, `tesseract.js` for scanned).
3. **Chunk** — the text is split into overlapping passages tied to the document.
4. **Embed** — each chunk is embedded locally with `@xenova/transformers`.
5. **Retrieve** — when a student asks a question, only chunks belonging to *that user* are retrieved (per-user isolation).
6. **Answer** — Claude is given a curated context block and the question, with a system prompt that forbids referencing anything outside the retrieved context.

This is the controlled-retrieval pattern from the product plan: the LLM never sees raw DB rows, never sees another student's documents, and never fabricates a citation that isn't in the retrieved context.

## Scripts

| Command          | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `npm run dev`    | Start Next.js dev server                         |
| `npm run build`  | Production build                                 |
| `npm start`      | Run the production build                         |
| `npm run db:push`| Apply `schema.prisma` to the database            |
| `npm run db:seed`| Load demo data                                   |
| `npm run db:reset` | Wipe the DB and reseed                         |

## Security

- Passwords hashed with bcryptjs.
- JWT auth in httpOnly cookies — JS on the page can't read the token.
- Per-user document isolation enforced at the retrieval layer.
- Uploads are stored outside the public web tree (`uploads/` is gitignored).

## Status

This repo is one slice of the larger College OS product. Other slices (mobile app, notifications, faculty/admin portals) live in separate repos and are not included here.

## License

Private / unlicensed for now. Add a `LICENSE` file when you're ready to open-source any part of this.
