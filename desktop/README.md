# Bundled desktop builds

StudioCut Desktop packages the compiled editor locally, not a remote website.
The renderer build is `pnpm --filter @workspace/studio-cut desktop:build`.
Desktop mode never mounts the web authentication or admin routes and never
reports local project activity to the web account API. Website login remains
required and unchanged for the hosted application.

Projects/media are saved under Electron's application profile using IndexedDB.
Use `.studiocut` backups to transfer projects between the app and browser.
Keep backups; uninstalling with profile deletion or clearing app data loses
local projects. Optional online assets/fonts may require internet; the editor
shell and bundled renderer do not. Preview/export require working graphics
acceleration. High Sierra is unsupported.

## Separate installer repository

The separate `aiwithrameez-droid/Studiocut` repository contains packaging files
only. It receives the compiled renderer as `studiocut-renderer.zip` attached to
a draft release; no credentials, private project data, or workspace configuration
are uploaded. Package versions must match the release's installer filenames.

Map the package manifest here to `desktop/package.json`, the runtime files in
`artifacts/studio-cut/desktop` to `desktop/`, and `build-workflow.yml` to
`.github/workflows/studio-cut-desktop.yml` in that repository.

The workflow tests startup and local project creation on native Windows/macOS
with HTTP/HTTPS requests blocked, builds the installers, and attaches them to
the release. Only after all builds succeed does it make the unsigned preview
release downloadable. This does not replace or weaken the workspace's separate
signed-release workflow, which still requires signing certificates.

Downloads:
- Windows x64: Windows 10 or newer, `.exe`
- Mac Intel: macOS 13 or newer, `.dmg`
- Mac Apple Silicon: macOS 13 or newer, `.dmg`
- Mac Intel Monterey: macOS 12 or newer, filename includes `macos12`

Unsigned previews trigger Windows SmartScreen and macOS Gatekeeper warnings;
do not describe them as signed, notarized, or tested on every supported OS.
Native startup smoke checks do not prove GPU playback or video export works
on a customer's hardware.
