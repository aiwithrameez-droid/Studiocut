# Standalone desktop build setup

These files configure the separate `aiwithrameez-droid/Studiocut` GitHub
repository to build installers without uploading the website or its secrets.

Repository mapping:

- `package.json` → `desktop/package.json`
- `artifacts/studio-cut/desktop/main.cjs` → `desktop/main.cjs`
- `build-workflow.yml` → `.github/workflows/studio-cut-desktop.yml`

The launcher opens the published website and requires internet access. It does
not bundle an offline editor. The first installers are unsigned.

Run **Build StudioCut desktop apps** manually in GitHub Actions. Each completed
job uploads its own ZIP under **Artifacts**:

- `studiocut-macos-intel` — Intel, macOS 13 or newer
- `studiocut-macos-apple-silicon` — M-series, macOS 13 or newer
- `studiocut-macos-intel-monterey` — Intel, macOS 12 Monterey
- `studiocut-windows-x64` — Windows 64-bit

Artifacts expire after 30 days. This workflow does not publish a GitHub Release
or populate the website's release download links.
