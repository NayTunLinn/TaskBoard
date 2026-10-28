<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Require authenticated accounts for boards and task details; enforce project membership and admin-only setup through database policies, never through viewer names.
- Link registered accounts to people through user_id and manage project memberships through project_members, so account access and task assignments share one directory.
- Group task file operations in one Excel menu and keep spreadsheet parsing in a dedicated browser utility so the board route remains focused.
- Keep account-role and project mapping controls in ProjectAccess; reset shared directory/task caches on account transitions to prevent cross-user stale data.
