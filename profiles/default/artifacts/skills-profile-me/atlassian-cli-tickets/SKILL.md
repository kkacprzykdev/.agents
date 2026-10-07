---
name: atlassian-cli-tickets
description: Retrieves Jira ticket information and attachments using the Atlassian CLI (acli). Use when the user asks about ticket details, wants to view Jira tickets, needs information about specific ticket keys like PROJ-1234, or wants to see/analyze images attached to tickets.
---

# Atlassian CLI - Getting Ticket Information

> **CRITICAL REQUIREMENT:** When retrieving any Jira ticket, you MUST automatically download and analyze ALL image attachments as part of the initial response. Do NOT ask the user if they want to see attachments - just include them. See "Complete Workflow" section for details.
>
> **CRITICAL REQUIREMENT:** If the Jira ticket includes Slack links, you MUST also fetch those Slack messages/threads, download and analyze ALL Slack image attachments, and include them in the same response.
>
> **CRITICAL REQUIREMENT:** If both Jira comments and Slack message data are available, you MUST present one unified chronological history timeline (oldest first) that combines both sources.
>
> **CRITICAL REQUIREMENT:** You MUST map each analyzed image to its parent Jira comment or Slack message/reply whenever possible, and place that image under the corresponding timeline event. If an image cannot be mapped to a Jira comment or Slack message/reply, list it separately in an `Unmapped images` section after the timeline.

## Prerequisites - CLI & Credentials Setup

### 1. Check if ACLI is Installed

Before any Jira operation, verify the CLI is available:

```bash
which acli 2>/dev/null && acli --version || echo "NOT_INSTALLED"
```

### 2. Install ACLI (if not installed)

If `NOT_INSTALLED`, install Atlassian CLI.

#### macOS (recommended: Homebrew)

```bash
brew tap atlassian/homebrew-acli
brew install acli
acli --version
```

#### macOS (without Homebrew)

Use `uname -ms` to detect architecture:
- `Darwin arm64` -> Apple Silicon
- `Darwin x86_64` -> Intel

```bash
# Apple Silicon
curl -LO "https://acli.atlassian.com/darwin/latest/acli_darwin_arm64/acli"

# Intel
curl -LO "https://acli.atlassian.com/darwin/latest/acli_darwin_amd64/acli"

chmod +x ./acli
mkdir -p ~/.local/bin
mv ./acli ~/.local/bin/acli
export PATH="$HOME/.local/bin:$PATH"
acli --version
```

#### Linux (binary install)

```bash
# x86_64
curl -LO "https://acli.atlassian.com/linux/latest/acli_linux_amd64/acli"

# arm64
curl -LO "https://acli.atlassian.com/linux/latest/acli_linux_arm64/acli"

chmod +x ./acli
mkdir -p ~/.local/bin
mv ./acli ~/.local/bin/acli
export PATH="$HOME/.local/bin:$PATH"
acli --version
```

If `acli` is still not found, tell the user to add this to their shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Use the official install guide if needed:
- https://developer.atlassian.com/cloud/acli/guides/install-acli/

### 3. Credentials File Location

Atlassian credentials are stored in a **user-level configuration file** (not project-specific) so they work across all projects and coding agents.

The agent checks for credentials in this priority order:

1. **`~/.atlassian-cli.env`** (primary - recommended)
2. **`~/.config/atlassian-cli/.env`** (alternative - XDG-compliant)
3. **Workspace `.env`** (fallback - for backward compatibility)

### 4. First-Time Setup

Before using this skill, the agent MUST check if credentials exist. If not found, the agent should:

1. **Create the credentials file** at `~/.atlassian-cli.env`:
   ```bash
   cat > ~/.atlassian-cli.env << 'EOF'
   # Atlassian CLI Credentials
   # This file is used by coding agents to authenticate with Jira
   # 
   # Get your API token at: https://id.atlassian.com/manage-profile/security/api-tokens
   
   JIRA_CLOUD_INSTANCE=company.atlassian.net
   ATLASSIAN_USER_EMAIL=your-email@company.com
   ATLASSIAN_API_TOKEN=your-api-token-here
   EOF
   ```

2. **Tell the user** to edit the file and fill in their credentials:
   - **IMPORTANT:** Always show the **absolute path** (with `$HOME` expanded) so the user can click it in the IDE. For example: `$HOME/.atlassian-cli.env` should be displayed as `/Users/username/.atlassian-cli.env`
   - Get the absolute path by running: `echo "$HOME/.atlassian-cli.env"` and show that path to the user
   - Example message to user: "Please edit `/Users/username/.atlassian-cli.env` and fill in your credentials"
   - `JIRA_CLOUD_INSTANCE`: Their Jira cloud instance (e.g., `company.atlassian.net`)
   - `ATLASSIAN_USER_EMAIL`: Their Atlassian account email
   - `ATLASSIAN_API_TOKEN`: API token from https://id.atlassian.com/manage-profile/security/api-tokens

3. **Wait for user confirmation** before proceeding with Jira operations

### 5. Checking for Existing Credentials

Before any Jira operation, run this check:

```bash
# Check for credentials file (in priority order)
if [ -f ~/.atlassian-cli.env ]; then
  source ~/.atlassian-cli.env
elif [ -f ~/.config/atlassian-cli/.env ]; then
  source ~/.config/atlassian-cli/.env
else
  echo "No credentials file found"
fi

# Verify required variables are set
if [ -z "$JIRA_CLOUD_INSTANCE" ] || [ -z "$ATLASSIAN_USER_EMAIL" ] || [ -z "$ATLASSIAN_API_TOKEN" ]; then
  echo "Missing required credentials"
fi
```

## Sourcing Credentials - CRITICAL

**Always source credentials from the user-level file, checking locations in priority order.**

**Correct pattern:**
```bash
source ~/.atlassian-cli.env 2>/dev/null || source ~/.config/atlassian-cli/.env 2>/dev/null && <command>
```

**For curl commands (downloading attachments):**
```bash
source ~/.atlassian-cli.env 2>/dev/null || source ~/.config/atlassian-cli/.env 2>/dev/null; \
curl -s -L -u "${ATLASSIAN_USER_EMAIL}:${ATLASSIAN_API_TOKEN}" \
  -o /tmp/<ticket-key>-image.png \
  "https://${JIRA_CLOUD_INSTANCE}/rest/api/3/attachment/content/<attachment-id>"
```

**Backward compatibility:** If user has credentials in workspace `.env`, that still works but the agent should suggest migrating to `~/.atlassian-cli.env` for cross-project use.

## Shell Permissions - CRITICAL

**All `acli` commands MUST run with `required_permissions: ["all"]`.**

The Atlassian CLI requires full system access to:
- Access network for API calls to Atlassian cloud
- Read/write to its credential store (typically in `~/.config/acli/`)
- Execute authentication flows

Running `acli` commands in the default sandbox will fail with errors like:
- `authentication failed`
- `failed to fetch work item details`
- `unauthorized`

**Always use:**
```
required_permissions: ["all"]
```

This applies to ALL `acli` commands including:
- `acli auth status`
- `acli jira auth login`
- `acli jira workitem view`
- Any other `acli` operations

Similarly, `curl` commands for downloading attachments require `required_permissions: ["all"]` since they need both network access and may write to locations outside the workspace.

## Quick Start

**Use a single command with JSON output to get the most accurate and complete ticket data:**

```bash
acli jira workitem view <TICKET-KEY> --fields "*all" --json
```

Example:
```bash
acli jira workitem view PROJ-1234 --fields "*all" --json
```

**IMPORTANT:** Always use `--fields "*all"` to retrieve ALL fields, including custom fields. Scan every `customfield_*` key. Parse ADF inside custom fields the same way as `description`. Do not assume field IDs — they vary by Jira site.

Using a subset of fields (e.g., `summary,description,status`) will miss this information!

This single command returns all ticket information including comments in Atlassian Document Format (ADF), which preserves:
- Text formatting (bold, italic, strikethrough, etc.)
- Links and inline cards (GitHub PRs, Confluence pages, etc.)
- Lists (bullet points, numbered lists)
- Full comment content without truncation
- All custom fields with their complete data

## Profile references

Resolve the Active profile first (`profile-references.mdc`). If that profile has `references/atlassian-cli-tickets.md`, use its custom-field map when interpreting JSON. If the reference is missing, treat all `customfield_*` equally; do not guess names from IDs.

**IMPORTANT - Avoiding Truncation:**
When retrieving ticket data, terminal command output may be truncated at 20,000 characters. To ensure complete data:
1. Save the JSON output to a temporary file first (e.g., `/tmp/<TICKET-KEY>.json`) to avoid truncation
2. Read the file to get the complete JSON data
3. Extract all information from the JSON and present it to the user in plain text format
4. Do NOT show the user the JSON file or mention saving files - this is an internal implementation detail
5. Present all ticket information in a readable, formatted plain text response with no truncation indicators

## Why JSON Format is Required

The default table/text output has significant limitations:
- **Strikethrough text is not displayed** - appears as regular text
- **Comments are truncated** - rich content like links and lists are stripped
- **Links may be lost** - inline cards and hyperlinks are converted to plain text

The `--json` flag returns the raw Atlassian Document Format (ADF) which contains the complete, accurate data.

## Avoiding Truncation

**CRITICAL:** When retrieving ticket data, terminal command output may be truncated at 20,000 characters. To ensure complete, untruncated data:

1. **Save output to a temporary file first (internal implementation):**
   ```bash
   acli jira workitem view PROJ-1234 --fields "*all" --json > /tmp/proj-1234.json
   ```

2. **Read the file to get complete JSON data:**
   Use the read_file tool to read the temporary file and extract all information.

3. **Present information to user in plain text:**
   - Extract all data from the JSON (summary, description, status, assignee, comments, etc.)
   - **Check ALL custom fields** (keys starting with `customfield_`). Scan every one. Parse ADF in custom fields. Do not assume IDs.
   - Parse ADF format to extract text, links, lists, formatting (custom fields may also contain ADF content)
   - Include attachments list with filenames and authors
   - Include reporter/creator information
   - **ALWAYS present comments in chronological order** (oldest first, newest last) based on the `created` timestamp
   - Present everything in a readable, formatted plain text response
   - **Never mention the temporary file or JSON format to the user**
   - **Never show truncation indicators like "(additional plans mentioned but truncated)"**
   - Ensure ALL information is included in the final response

**Always use this approach** to prevent missing information from truncated responses. Large tickets with extensive descriptions, multiple comments, or detailed ADF content can easily exceed the truncation limit. The file saving is purely an internal step to avoid truncation - the user should only see the final, complete plain text summary.

## Understanding ADF (Atlassian Document Format)

The JSON output contains structured content. Key elements to look for:

### Text Formatting
```json
{
  "marks": [
    { "type": "strong" },
    { "type": "strike" }
  ],
  "text": "STRIKETHROUGH_TEXT",
  "type": "text"
}
```
- `"type": "strike"` = strikethrough text
- `"type": "strong"` = bold text
- `"type": "em"` = italic text

### Links
```json
{
  "marks": [
    {
      "attrs": { "href": "https://example.com" },
      "type": "link"
    }
  ],
  "text": "Link text",
  "type": "text"
}
```

### Inline Cards (GitHub PRs, etc.)
```json
{
  "attrs": {
    "url": "https://github.com/org/repo/pull/123"
  },
  "type": "inlineCard"
}
```

### Lists
```json
{
  "type": "bulletList",
  "content": [
    {
      "type": "listItem",
      "content": [...]
    }
  ]
}
```

## Authentication

Before viewing tickets, ensure you're authenticated. The agent can automatically authenticate using environment variables.

**IMPORTANT:** All authentication commands require `required_permissions: ["all"]` - see "Shell Permissions" section above.

### Automatic Authentication (Recommended)

If the credentials file exists (see Prerequisites), authenticate automatically:

```bash
# Run with required_permissions: ["all"]
source ~/.atlassian-cli.env 2>/dev/null || source ~/.config/atlassian-cli/.env 2>/dev/null; \
echo "$ATLASSIAN_API_TOKEN" | acli jira auth login --site "$JIRA_CLOUD_INSTANCE" --email "$ATLASSIAN_USER_EMAIL" --token
```

### Manual Authentication Check

1. **Check authentication status:** (requires `required_permissions: ["all"]`)
   ```bash
   acli auth status
   ```

2. **If not authenticated and credentials file exists, run:** (requires `required_permissions: ["all"]`)
   ```bash
   source ~/.atlassian-cli.env 2>/dev/null || source ~/.config/atlassian-cli/.env 2>/dev/null; \
   echo "$ATLASSIAN_API_TOKEN" | acli jira auth login --site "$JIRA_CLOUD_INSTANCE" --email "$ATLASSIAN_USER_EMAIL" --token
   ```

3. **If credentials file is missing**, create it and ask the user to fill it in (see "First-Time Setup" in Prerequisites section).

## Field Options

**ALWAYS use `*all` to get complete ticket information:**

```bash
acli jira workitem view PROJ-1234 --fields "*all" --json
```

Available field options:
- `*all` - returns all fields (RECOMMENDED - always use this!)
- `*navigable` - returns navigable fields
- Specific fields: `summary`, `description`, `status`, `assignee`, `comment`, `issuetype`, `priority`, `labels`, `created`, `updated`
- Exclude fields: `-description` (returns all except description)

**Why `*all` is required:**
Many Jira projects store critical information in custom fields that won't be retrieved with specific field names. Scan every `customfield_*`. Parse ADF. Do not assume IDs. Custom fields may hold the real description, form answers, attachments metadata, reporter and creator information, resolution details, and other project-specific metadata.

**Remember:** Always save to a temporary file first (internally) to avoid truncation, then extract all information and present it to the user in complete plain text format with no truncation indicators.

## Downloading and Viewing Attachments

Jira tickets often contain image attachments (screenshots, diagrams) that provide important context. You can automatically download and view these attachments.

### Prerequisites for Attachments

Ensure all environment variables are configured (see Prerequisites section at the top). The following are required for downloading attachments:
- `JIRA_CLOUD_INSTANCE` - Used to construct the download URL
- `ATLASSIAN_USER_EMAIL` - Used for authentication
- `ATLASSIAN_API_TOKEN` - Used for authentication

If any are missing, ask the user to add them to their `.env` file.

### Finding Attachment IDs

When you retrieve ticket data with `--fields "*all" --json`, attachments are listed in the `attachment` array:

```json
"attachment": [
  {
    "id": "100001",
    "filename": "screenshot.png",
    "author": { "displayName": "Name" },
    "created": "2025-12-12T00:41:25.175+0100",
    "content": "https://internal.example.net/rest/api/3/attachment/content/100001"
  }
]
```

**IMPORTANT:** The `content` URL in the JSON uses an internal hostname that is not accessible. You must use the public Jira URL instead.

### Downloading Attachments

Use curl with the **public Jira URL** (from `$JIRA_CLOUD_INSTANCE`) to download attachments.

**CRITICAL:** Source credentials from the user-level file (`~/.atlassian-cli.env`). See "Sourcing Credentials" section above.

**Correct pattern:**
```bash
source ~/.atlassian-cli.env 2>/dev/null || source ~/.config/atlassian-cli/.env 2>/dev/null; \
curl -s -L -u "${ATLASSIAN_USER_EMAIL}:${ATLASSIAN_API_TOKEN}" \
  -o /tmp/<ticket-key>-image.png \
  "https://${JIRA_CLOUD_INSTANCE}/rest/api/3/attachment/content/<attachment-id>"
```

**Example - downloading multiple attachments in parallel:**

```bash
# Image 1 (attachment ID: 100001)
source ~/.atlassian-cli.env 2>/dev/null || source ~/.config/atlassian-cli/.env 2>/dev/null; \
curl -s -L -u "${ATLASSIAN_USER_EMAIL}:${ATLASSIAN_API_TOKEN}" \
  -o /tmp/proj-1234-image1.png \
  "https://${JIRA_CLOUD_INSTANCE}/rest/api/3/attachment/content/100001"

# Image 2 (attachment ID: 100002)
source ~/.atlassian-cli.env 2>/dev/null || source ~/.config/atlassian-cli/.env 2>/dev/null; \
curl -s -L -u "${ATLASSIAN_USER_EMAIL}:${ATLASSIAN_API_TOKEN}" \
  -o /tmp/proj-1234-image2.png \
  "https://${JIRA_CLOUD_INSTANCE}/rest/api/3/attachment/content/100002"
```

**Key points:**
- **ALWAYS source from `~/.atlassian-cli.env`** (with fallback to `~/.config/atlassian-cli/.env`)
- **ALWAYS use `$JIRA_CLOUD_INSTANCE`** - NOT the internal URL from the JSON (`internal.example.net`)
- Use `-L` flag to follow redirects (Jira redirects to `api.media.atlassian.com`)
- Use `-s` flag for silent mode
- Save to `/tmp/` with a descriptive filename
- **Use `required_permissions: ["all"]`** for the shell command (needed for network access and credential handling)
- **Verify downloads succeeded** by checking file type with `file /tmp/<filename>` - if the file is only ~95 bytes and shows "JSON data", it's an error message, not an image

### Viewing Downloaded Images

After downloading, use the Read tool to view and analyze the images:

```
Read /tmp/proj-1234-image1.png
```

The Read tool supports image formats (png, jpg, gif, webp) and will display the image content for analysis.

### Complete Workflow

When retrieving a Jira ticket with attachments:

1. **Check `acli` is installed**:
   ```bash
   which acli 2>/dev/null && acli --version || echo "NOT_INSTALLED"
   ```
   - If `NOT_INSTALLED`, install ACLI first (see "Install ACLI" in Prerequisites)

2. **Check credentials exist** (first time only):
   ```bash
   [ -f ~/.atlassian-cli.env ] || [ -f ~/.config/atlassian-cli/.env ] && echo "Credentials found" || echo "No credentials"
   ```
   - If not found, create the file and ask user to fill it in (see "First-Time Setup")

3. **Fetch ticket data** and save to temp file:
   ```bash
   acli jira workitem view <TICKET-KEY> --fields "*all" --json > /tmp/<ticket-key>.json
   ```

4. **Parse the JSON** to extract attachment IDs and filenames from the `attachment` array

5. **Download image attachments** using curl with user-level credentials:
   ```bash
   source ~/.atlassian-cli.env 2>/dev/null || source ~/.config/atlassian-cli/.env 2>/dev/null; \
   curl -s -L -u "${ATLASSIAN_USER_EMAIL}:${ATLASSIAN_API_TOKEN}" \
     -o /tmp/<ticket-key>-image1.png \
     "https://${JIRA_CLOUD_INSTANCE}/rest/api/3/attachment/content/<attachment-id>"
   ```

6. **Verify downloads succeeded** - check file type to ensure it's an image, not a JSON error:
   ```bash
   file /tmp/<ticket-key>-image*.png
   ```
   - If output shows "PNG image data" → download succeeded
   - If output shows "JSON data" or file is ~95 bytes → download failed, check credentials

7. **Read and analyze the images** using the Read tool:
   ```
   Read /tmp/<ticket-key>-image1.png
   ```

8. **Include image descriptions** in your response to the user

9. **If Slack links are present**, trigger the `slack-messages` skill (including its Auth Gate) and fetch the referenced messages/threads (using Direct Slack API), including Slack file metadata. If that skill returns `AUTH_BLOCKED`, stop Slack fetching, ask the user to paste a Slack API cURL into the chat, and wait — do not read Slack another way or skip those links silently.

10. **Download, verify, read, and analyze ALL Slack image attachments** from those linked Slack messages/threads.

11. **Create one merged history timeline** that combines:
   - Jira comments
   - Linked Slack messages/thread replies
   - Source label for each event (for example: `[Jira comment]`, `[Slack message]`)
   - Chronological order using timestamps (oldest first, newest last)
   - Image references nested under the specific timeline event they belong to (do not list attached images separately)
   - De-duplication of mirrored/system-generated duplicates when possible

12. **Create an `Unmapped images` section** after the timeline **only** for images that cannot be tied to a Jira comment or Slack message/reply.
   - Include filename/id, source (Jira/Slack), and a short reason why mapping was not possible.

13. **Present the merged timeline and image analysis** in the final response.

**CRITICAL - MANDATORY:** Steps 5-8 (download, verify, read images, and include descriptions) MUST be done automatically as part of the initial ticket retrieval. Do NOT ask the user if they want to see attachments - just download and analyze them immediately. Users expect to see image contents and descriptions when asking about a ticket. Failure to do this automatically is a violation of this skill's requirements.

**CRITICAL - MANDATORY (Slack links):** If Slack links are found, steps 9-13 are also mandatory. It is a violation of this skill to fetch Slack text without downloading/analyzing Slack image attachments, to present separate Jira/Slack histories instead of one merged timeline, or to list mapped images outside their parent timeline events.

## Cross-Referencing Linked Jira Tickets and Comments

**CRITICAL - MANDATORY:** When parsing the ticket description, comments, or custom fields, look for **links to other Jira tickets or specific comments** matching patterns like:

- `https://<instance>.atlassian.net/browse/<TICKET-KEY>` — link to another Jira ticket
- `https://<instance>.atlassian.net/browse/<TICKET-KEY>?focusedCommentId=<COMMENT-ID>` — link to a specific comment on another ticket

**When a linked Jira ticket/comment is found:**

1. Automatically fetch the linked ticket using `acli jira workitem view <TICKET-KEY> --fields "*all" --json > /tmp/<ticket-key>.json`
2. If the link includes a `focusedCommentId`, find and extract that specific comment from the fetched ticket's comment array (match by `id` field)
3. If the link is to a ticket without a specific comment, extract the ticket summary and description
4. Present the linked content inline in your response under the section where the link appeared (e.g., "Option 4 described here: ...")
5. If the linked ticket itself has image attachments referenced in the relevant comment, download and analyze those too
6. Apply the same cross-referencing recursively if the linked content contains further Jira links (up to 2 levels deep to avoid infinite loops)

**Do NOT ask the user** if they want to see the linked ticket/comment content — fetch it automatically, just like image attachments and Slack messages. The linked content is essential context for understanding the current ticket.

**Example:** If the description says *"implement Option 4 [described here](https://company.atlassian.net/browse/PROJ-5678?focusedCommentId=12345)"*, the agent MUST:
1. Fetch PROJ-5678
2. Find comment with id `12345`
3. Extract and present the comment text as part of the ticket summary

## Additional Options

### Open in web browser
```bash
acli jira workitem view PROJ-1234 --web
```

### List attachments
```bash
acli jira workitem attachment list --key PROJ-1234
```

## Output Structure

The JSON output contains standard fields and custom fields:

```json
{
  "key": "PROJ-1234",
  "fields": {
    "summary": "Ticket title",
    "status": { "name": "Done" },
    "assignee": { "displayName": "Name", "emailAddress": "email@example.com" },
    "reporter": { "displayName": "Name", "emailAddress": "email@example.com" },
    "creator": { "displayName": "Name", "emailAddress": "email@example.com" },
    "issuetype": { "name": "Task" },
    "priority": { "name": "Major" },
    "description": { "content": [...], "type": "doc" },
    "created": "2025-06-30T09:30:00.283+0200",
    "updated": "2025-06-30T10:00:00.000+0200",
    "resolution": { "name": "Done" },
    "resolutiondate": "2025-06-30T10:00:00.000+0200",
    "duedate": "2025-07-01",
    "labels": ["label1", "label2"],
    "attachment": [
      {
        "filename": "screenshot.png",
        "author": { "displayName": "Name" },
        "created": "2025-06-30T09:30:00.283+0200"
      }
    ],
    "comment": {
      "comments": [
        {
          "author": { "displayName": "Author Name" },
          "body": { "content": [...], "type": "doc" },
          "created": "2025-06-30T09:30:00.283+0200"
        }
      ]
    },
    "customfield_XXXXX": { "content": [...], "type": "doc" }
  }
}
```

### Custom fields

Inspect every `customfield_*` key. Parse ADF in custom fields. Do not assume IDs. Use the Active profile reference when it exists (**Profile references**); otherwise treat every custom field equally.

**Tip:** Custom fields with ADF content (containing `"type": "doc"`) should be parsed the same way as the description field to extract text, lists, links, and formatting.

### Important - Comment Ordering

- Comments in the JSON are typically already in chronological order, but **ALWAYS verify and present them chronologically** (oldest first, newest last)
- Use the `created` timestamp field to determine the order
- Format each comment with: author name, date (from `created` field), and optionally the `updated` date if different from `created`
- Present comments as a numbered or labeled list showing chronological activity

## Troubleshooting

### Sandbox Permission Errors (Most Common)

If you get errors like `authentication failed` or `failed to fetch work item details`, the most likely cause is running `acli` commands in the default sandbox.

**Solution:** Always use `required_permissions: ["all"]` for ALL `acli` commands. See "Shell Permissions" section above.

Common symptoms of sandbox issues:
- `authentication failed` even with correct credentials
- `failed to fetch work item details` 
- Commands hang or timeout
- Network-related errors

### Unauthorized Error

If you get an "unauthorized" error (with correct permissions):

1. **First, check if credentials file exists and has values:**
   ```bash
   # Run with required_permissions: ["all"]
   source ~/.atlassian-cli.env 2>/dev/null || source ~/.config/atlassian-cli/.env 2>/dev/null; \
   echo "Instance: $JIRA_CLOUD_INSTANCE, Email: $ATLASSIAN_USER_EMAIL, Token set: $([ -n "$ATLASSIAN_API_TOKEN" ] && echo 'yes' || echo 'no')"
   ```

2. **If credentials are set, authenticate:**
   ```bash
   # Run with required_permissions: ["all"]
   source ~/.atlassian-cli.env 2>/dev/null || source ~/.config/atlassian-cli/.env 2>/dev/null; \
   echo "$ATLASSIAN_API_TOKEN" | acli jira auth login --site "$JIRA_CLOUD_INSTANCE" --email "$ATLASSIAN_USER_EMAIL" --token
   ```

3. **If credentials file is missing**, create it:
   ```bash
   cat > ~/.atlassian-cli.env << 'EOF'
   JIRA_CLOUD_INSTANCE=company.atlassian.net
   ATLASSIAN_USER_EMAIL=user@company.com
   ATLASSIAN_API_TOKEN=your-token-here
   EOF
   ```
   Then ask the user to edit `~/.atlassian-cli.env` and fill in their credentials.

4. After setup, try viewing the ticket again

### Attachment Download Fails (Permission Denied or JSON Error)

If downloading attachments returns a JSON error like `{"errorMessages":["You do not have permission to view attachment..."]}`:

1. **Check that credentials file exists and is being sourced:**
   ```bash
   # Check if file exists
   ls -la ~/.atlassian-cli.env ~/.config/atlassian-cli/.env 2>/dev/null
   
   # Verify credentials are loaded
   source ~/.atlassian-cli.env 2>/dev/null || source ~/.config/atlassian-cli/.env 2>/dev/null; \
   echo "Email: $ATLASSIAN_USER_EMAIL, Instance: $JIRA_CLOUD_INSTANCE"
   ```

2. **If credentials file doesn't exist**, create it (see "First-Time Setup" in Prerequisites)

3. **If credentials exist but download still fails:**
   - Verify the API token is valid and not expired
   - Check that the user has permission to view the ticket's attachments
   - Try regenerating the API token at: https://id.atlassian.com/manage-profile/security/api-tokens

4. **Verify the download succeeded:**
   ```bash
   file /tmp/<ticket-key>-image.png
   ```
   - Should show "PNG image data" (or similar for the actual format)
   - If it shows "JSON data" or the file is ~95 bytes, the download failed

### Authentication Fails

If authentication fails even with correct env vars and `required_permissions: ["all"]`:
- Verify the API token is valid and not expired
- Ensure `JIRA_CLOUD_INSTANCE` is correct (e.g., `company.atlassian.net`, not `https://company.atlassian.net`)
- Check that `ATLASSIAN_USER_EMAIL` matches your Atlassian account email
- Try regenerating the API token at: https://id.atlassian.com/manage-profile/security/api-tokens

### When Something Doesn't Work or Can't Be Found

**IMPORTANT:** If a command doesn't work as expected, a field cannot be retrieved, or you need to find information about a specific feature (like attachments, etc.), **ALWAYS** check the official Atlassian CLI documentation:

**Documentation URL:** https://developer.atlassian.com/cloud/acli/reference/commands/

The documentation contains:
- Complete list of all available commands
- Detailed command syntax and options
- Examples for each command
- Information about subcommands (e.g., `attachment-list`, etc.)

## Cross-Referencing Slack Messages

When parsing Jira ticket data (description, comments, custom fields), look for **Slack message links** matching this pattern:

```
https://<workspace>.slack.com/archives/<CHANNEL_ID>/p<TIMESTAMP>
```

Examples:
- `https://workspace.slack.com/archives/C1234567890/p1234567890123456`
- `https://company.slack.com/archives/C1234567890/p1234567890123456`

**When a Slack link is found:**

1. Automatically trigger the **slack-messages** skill (read it from `~/.agents/profiles/default/artifacts/skills-profile-me/slack-messages/SKILL.md`), including its Auth Gate (`check-auth.py` must print `AUTH_OK` first).
2. Parse the URL to extract the channel ID and message timestamp
3. Fetch the full Slack thread using the Direct Slack API method (including file attachments/images)
4. Download and display any images attached to the Slack messages
5. Include the Slack message content and image descriptions alongside the Jira ticket information
6. Merge Jira comments and Slack messages into one chronological history timeline (oldest first), labeling each entry with its source

This provides complete context without requiring the user to manually ask for Slack content.

**Do NOT ask the user** if they want to see the Slack message — fetch it automatically, just like image attachments. **Do** stop and wait if Slack auth is blocked. Asking the user to paste a Slack API cURL into the chat (slack-messages skill) is required; skipping Slack or fetching it another way is not.

### Unified Timeline Format (Required when both sources exist)

When both Jira comments and linked Slack messages are available, always present a single timeline section:

- `[timestamp] [Jira comment] <author>: <message>`
- `[timestamp] [Slack message] <author/user>: <message>`
- Include thread replies inline at their actual timestamps
- Include references to image attachments under the corresponding timeline entry (same event block)
- Keep oldest first, newest last

After the timeline:

- Add `Unmapped images` only for images that cannot be tied to a Jira comment or Slack message/reply
- Do not place mapped images in `Unmapped images`

## Deprecated Approach (Do Not Use)

**Do NOT use these commands** - they return incomplete/inaccurate data:

```bash
# BAD - loses formatting, truncates content
acli jira workitem view PROJ-1234
acli jira workitem comment list --key PROJ-1234
```

The `comment list` command converts rich content to plain text and loses:
- Links and inline cards
- List structure
- All text formatting

**Always use the single JSON command instead.**
