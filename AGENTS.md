# AGENTS.md

## Project Status

`@liminal-hq/jax` is the Jax library: the Liminal HQ otter as a small 3D companion that lives in an app, with calm, spring-smoothed moods. The shared contract is in `src/types.ts`. The core scene and renderer (`src/model`, `src/render`, `src/fallback`) and the motion engine (`src/motion`) are built to that contract. Update this section as each part lands.

## Coding Standards

- **Spelling:** Use Canadian English for code, comments, documentation, commit messages and pull request descriptions unless exact external spelling is required by tooling, APIs or published identifiers (for example `color` in a three.js API).
- **Naming:** Keep public API names outcome-focused and readable.
- **Authoring voice:** Write comments and docs as the author of the artifact, for the reader who meets it later. Do not mention "this PR", reviewers or commit SHAs in source or docs.

## Markdown Formatting

- Do not hard-wrap markdown prose. Write each paragraph or bullet as one line. Commit message bodies are the exception.
- Use a real em dash (`—`) in prose, never `--` (CLI flags excepted).

## Commit Messages

Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `build:`, `chore:`). Use `test:` for test-only changes. The very first commit of the repository has the subject exactly `Initial Commit`. Every commit has a body.

Body requirements:

- Explain what changed and why, not how.
- Use markdown: **bold** labels, `code`, flat bullets. No markdown headings.
- Backtick every code-level reference (functions, types, paths, config keys).
- Hard-wrap paragraphs at roughly 72–100 characters.
- Each message describes that commit, not the project history.

Shell safety: write the message to a file with a single-quoted heredoc and commit with `git commit -F <file>`. Verify with `git log -1 --pretty=fuller` and amend if the shell altered the content.

Commit as you go with small, coherent commits.

## Git Workflow

- Do not push, tag or force-push unless the user explicitly asks. Commits stay local for now.
- **Branch naming:** `<type>/<short-description>` where `<type>` matches the commit type (`feat`, `fix`, `docs`, `test`, `ci`, `build`, `chore`). Merge topic branches locally with `--no-ff`.
- When several agents work in parallel, keep to your own files and branch, and do not edit another agent's files.

## Testing

- Run `bun run test`, `bun run lint`, `bun run format:check` and `bun run build` before considering work complete.
- Pure modules (motion, blending, the mood machine, pose maths) are written tests first with fake time. Scene code is tested with a thin renderer seam so unit tests never create a WebGL context.
- State explicitly when a change has not been looked at in a real browser; unit tests cannot judge how smooth a movement looks.

## Project Structure

- TypeScript library, ESM, strict. `three` is a peer dependency and is imported only under `src/render` and `src/model`. The `./fallback` entry point must not import `three`.
- Package manager `bun`. Tests `vitest`. Lint and format `eslint` and `prettier`. Build `tsc` (emits `dist/` with declarations).
- `src/types.ts`: the shared contract (moods, signals, pose channels, skins, animation patterns, the `Motion` and `Jax` interfaces). Change it only deliberately and say so in the commit.
- `src/motion/`: springs, easing and blending, the mood machine, the motion engine, default animation patterns.
- `src/model/`: the slab builder and the otter model built from a skin.
- `src/render/`: renderer lifecycle (`createJax`), visibility and reduced-motion gating, context-loss handling.
- `src/fallback/`: the no-WebGL SVG and CSS companion (no `three`).
- `demo/`: a small demo page.

## Licence and Copyright

New source files need a header as the first content, before imports, on `.ts` files in `src/`. Not on generated files, lockfiles, config files or markdown.

```ts
// Brief one-line summary of what this file does
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
```
