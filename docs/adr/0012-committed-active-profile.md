# The Active profile is committed per branch

`profiles/.env.active` is committed on every Profile branch with that branch's profile name (`ACTIVE_PROFILE=<name>`). Checking out a branch switches the Active profile, and agents read one file to learn it. The file lives outside every profile, because an agent must know the profile before it can open that profile's files. The Core branch has no such file, because it has no profile.

A Profile branch contains the folder of every profile in its Lineage, so the folder list cannot say which one is active. Deriving the profile from the branch name fails on feature branches and during a merge or rebase. A gitignored, hand-set selector can disagree with the branch that is checked out.
