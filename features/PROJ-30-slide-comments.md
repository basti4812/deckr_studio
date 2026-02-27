# PROJ-30: Slide Comments (Threaded)

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-24 (Project Creation & Management)
- Requires: PROJ-25 (Project Sharing) — comments visible to all shared users
- Requires: PROJ-8 (User Profile) — author name and avatar
- Requires: PROJ-13 (In-app Notifications) — new comment notification
- Requires: PROJ-14 (Email Notifications) — new comment email

## User Stories
- As a user, I want to leave a comment on a slide in a shared project so that I can communicate feedback without switching to another tool
- As a user, I want to see comments from all collaborators so that I have full context on the discussion
- As a user, I want to reply to a comment in a thread so that the conversation is organized and readable
- As a user, I want to delete my own comments so that I can correct mistakes
- As an admin or project owner, I want to delete any comment so that I can moderate content

## Acceptance Criteria
- [ ] `comments` table: id, project_id, slide_id, slide_instance_index, parent_comment_id (nullable), author_id, body, created_at, deleted_at (nullable)
- [ ] Comment button/icon on each slide in the tray; clicking opens the comment panel for that slide
- [ ] A yellow comment icon on the tray slide card indicates that comments exist (PROJ-21)
- [ ] Comments panel shows: all top-level comments sorted oldest first, with threaded replies nested beneath
- [ ] Each comment shows: author avatar, author name, timestamp (relative), comment text
- [ ] Reply button on each comment opens an inline reply input
- [ ] Comment input: textarea, submit on button click or Cmd/Ctrl+Enter
- [ ] Users can delete only their own comments; admins and project owners can delete any comment
- [ ] Deleted comments show "This comment was deleted" placeholder (not removed from thread, to preserve thread continuity)
- [ ] New comment triggers in-app and email notification to all other project participants (owner + shared users)
- [ ] Comments are visible to all users who have access to the project (owner + shared users); not visible to external viewers (PROJ-35)

## Edge Cases
- What if a user who left a comment is removed from the team? → Comments remain; author name shows as "Former member"
- What if the project is archived? → Comments are preserved; no new comments can be added (archived = read-only)
- What if a comment contains very long text? → Display with "Show more" truncation after 300 chars
- What if a user comments on an unshared (personal) project? → Comments are visible only to the owner; still stored in DB
- What if the same user comments multiple times in quick succession? → Each comment is separate; no rate limiting

## Technical Requirements
- `parent_comment_id` enables threading: only one level of nesting (replies to top-level comments only; no nested replies)
- Comments are loaded per slide when the comment panel is opened (lazy load)
- Real-time updates via Supabase Realtime for new comments in the panel (while the panel is open)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
