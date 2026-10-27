# Sync removes old links by scanning Agent homes

`ag sync` clears every Runtime target that the Runtime mappings list, then links again (ADR 0018). When Core removes a target or a whole coding agent, nothing clears that folder any more, and its links into the store stay behind, often broken.

So each Sync also scans Agent homes, between clearing the targets and creating the links. It scans every Agent home the Runtime mappings list, and every one it remembers syncing on this computer, two levels deep: the entries of the Agent home, and the entries of each folder directly in it. It does not follow symlinked folders. It removes each symlink that points into the store's sources (profile folders, Store and Core-owner artifact folders, and `skills/`) or into the Derived files in `sync/.generated/` (ADR 0033), and that the current plan does not create. Real files keep their meaning as Blockers and Unmanaged artifacts, so the scan never touches them. `ag status` reports stale links with the same scan.

Sync remembers the Agent homes it synced in `ag-agent-homes` in the clone's git directory, which is never committed. Each Sync adds the homes it synced. A listed home that does not exist on this computer is skipped and not added. A remembered home whose folder is gone stays in the record, and is scanned again when it comes back. `--dry-run` reports what the scan would remove and writes nothing, the record included.

The first Sync with the scan on a computer has no record yet, so it scans only the listed homes. An Agent home whose coding agent Core removed before that Sync is not cleaned on that computer. A Sync by an `ag` from before the scan cleans as it did, and the next Sync by a newer `ag` removes what it left.

## Considered Options

- **A record of every link Sync made:** it would need writing on every Sync, and it could not clean links that an `ag` from before the record made. The scan finds them by where they point.
- **A list of removed targets kept in Core:** every Core change that drops a target or a coding agent would need an extra step, and the list would only grow.
- **No cleanup:** a coding agent would keep reading old artifacts, through links into folders that no longer exist or that now hold another profile's files.
