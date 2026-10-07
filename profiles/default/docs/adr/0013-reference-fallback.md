# References fall back along the Lineage

A reference resolves in order: the Active profile's file, then its parent's file, and so on up to `default`, then the artifact's generic behavior. Each file resolves on its own and replaces every ancestor's file of the same name as a whole. Each branch writes only its own profile's references.

Every branch in the Lineage already contains its ancestors' references. Copying each inherited reference into every profile would drift. The cost is that a new artifact quietly uses an ancestor's values on other profiles until they add an override.
