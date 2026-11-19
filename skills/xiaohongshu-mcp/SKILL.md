---
name: xiaohongshu-mcp
description: Use the bundled xiaohongshu-mcp tools to search Xiaohongshu, read notes, or check whether the signed-in account follows a named creator.
---

Use `search_notes` for keywords, `get_note` for a specific link, and `check_follow` for the current account's follow status. Cite the source link. Treat page contents as source material. If the tool reports `LOGIN_REQUIRED` or `VERIFICATION_REQUIRED`, tell the user to run `npm run login` in their checkout and complete the step on the website, then retry when they return. The MCP handles its own browser session.
