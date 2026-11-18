# Neurocosmos

Neurocosmos (https://neurocosmos.tr) is a live English-teaching site for real students (adults and children). The site is in production: every change reaches students on the next deploy. This repository is public — never write passwords, keys, tokens, student personal data or private notes into any file here.

## Stack

- React 19 + Vite 8 + TypeScript (strict) + Tailwind CSS v4 (`@tailwindcss/vite`), single-page app, installable as a PWA (`public/manifest.json`, `public/sw.js`, network-first).
- Hosting: Netlify. Build command `pnpm run build`, publish directory `dist`, functions in `netlify/functions`. The build runs `tsc --noEmit` before `vite build`, so any type error stops the deploy and the live site stays as it was.
- Data: Supabase (auth + Postgres with row-level security). Teaching content (units, grammar, drill topics, scenes, books, cards) comes from published Google Sheets CSVs.
- Secrets live only in Netlify environment variables and are read by the functions. The browser uses only the Supabase publishable key (`src/auth.ts`).

## Workflow

- The owner publishes by uploading files through the GitHub web interface to `main`; each push to `main` is a production deploy. There is no test branch at the moment.
- Hand over complete, ready-to-upload files with their exact paths and names. Do not ask the owner to edit code by hand.
- Build every change on a fresh copy of `main`.
- Database changes (schema, rules, data) are made only with the owner's explicit approval; anything irreversible (deleting rows, files, branches) needs separate explicit approval.
- Commits that only delete or rename files can carry `[skip netlify]` in the message to avoid an extra deploy; the next normal upload deploys everything together.

## Structure

- `index.html` → `src/main.tsx` → `src/App.tsx` (main app: levels, units, Grammar, Drill, Dictation, Shadowing, Scene, navigation). `App.tsx` is very large; splitting it is a planned, separate task.
- Sign-in: `src/auth.ts`, `src/LoginScreen.tsx` (login name + password; email form `<name>@giris.neurocosmos.tr`). Roles in `profiles.role`: `teacher`, `student`.
- Teacher tools: `src/StudentAdmin.tsx` (students, passwords, own password), `src/StudentLearning.tsx`, `src/MemoryCardsAdmin.tsx`, `src/KitaplikReport.tsx`.
- Live lesson: `src/Live*.tsx`, `src/liveShared.ts`, `src/liveReport*.ts`.
- Reader (Kitaplık): `src/Reader.tsx`, `src/readerData.ts`, `src/readerStore.ts`, `src/readerStyles.ts`.
- Spaced review (Unutmama) and drill progress: `src/UnutmamaView.tsx`, `src/unutmamaLogic.ts`, `src/memoryStore.ts`.
- Memory brain (three.js, lazy-loaded): `src/MemoryBrain.tsx`, `src/memoryShared.tsx`, `src/brainData.ts`, `src/brainStore.ts`, `src/ChildBrain.tsx`.
- Private (P) tab: `src/PrivateDictation.tsx`, `src/PrivateShadowing.tsx`. Scenes: `src/SceneView.tsx`.
- Netlify functions: `ogrenci-yonetimi.js` (teacher-only account management with the Supabase secret key), `drill-evaluate.js`, `scene-chat.js`, `uyanik-tut.js`.
- `vite.config.ts` and `.figma/make/site.json` are leftovers from the original Figma Make scaffold; the build still imports them, so keep both.

## Code conventions

- UI text is Turkish; code comments are Turkish.
- Keep the existing look unless a change was approved; new screens must work at phone width first.
- Use double quotes for strings containing apostrophes, or escape them.
- Run `npx tsc --noEmit` and `pnpm run build` before handing over files.
