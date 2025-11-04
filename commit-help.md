## ✅ Commit Format for Conventional Commits

Here’s how to write your commits to trigger semantic versioning:

| Commit Message | Version Bump |
| --- | --- |
| `fix: something` | Patch (x.y.**z**) |
| `feat: new thing` | Minor (x.**y**.z) |
| `feat!: breaking change` | Major (**x**.y.z) |
| `chore(deps): update libs` | No bump, unless configured |