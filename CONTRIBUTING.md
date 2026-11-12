# Contributing

## Branches
`main` is always deployable. Nothing is committed to it directly; every change lands through a pull request.

| Prefix | Use |
|---|---|
| `feature/<slug>` | new functionality |
| `fix/<slug>` | bug fixes |
| `chore/<slug>` | tooling, deps, config, CI |
| `refactor/<slug>` | restructuring without behaviour change |
| `docs/<slug>` | documentation only |
| `design/<slug>` | visual / design-system work |

Branch from an up-to-date `main`, one topic per branch, and link the roadmap issue in the PR (`Closes #12`).

## Commits
[Conventional Commits](https://www.conventionalcommits.org): `feat(clips): add Kick URL parser`, `fix(auth): ...`, `chore(deps): ...`.
