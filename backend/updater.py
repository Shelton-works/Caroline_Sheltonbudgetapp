"""
updater.py — Standalone Auto-Update Module
============================================
A modular, non-blocking update checker for Python applications targeting
Windows (.exe) and Android (.apk) distributions.

Usage in your main app:
    from updater import check_for_updates

    # Single call — runs in a background thread, never blocks startup.
    check_for_updates(
        current_version="1.0.0",
        github_repo="owner/repo",           # e.g. "sheltonbechani/budget-app"
        version_filename="version.json",     # filename on the releases page
    )

Dependencies (add to requirements.txt):
    requests>=2.31.0
    packaging>=23.0
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import platform
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

# ---------------------------------------------------------------------------
# Optional dependencies — gracefully degrade if missing
# ---------------------------------------------------------------------------

try:
    import requests
    from packaging.version import Version, InvalidVersion
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

# ---------------------------------------------------------------------------
# Logging — configured on first import; can be overridden by the host app.
# ---------------------------------------------------------------------------

logger = logging.getLogger("updater")


# ===================================================================
# 1.  Version Manifest Schema  (documented via dataclass + JSON dump)
# ===================================================================


@dataclass
class PlatformAsset:
    """Schema for a single platform's release asset block in version.json."""

    download_url: str
    """Direct download URL for the installer/APK (typically a GitHub Release asset)."""

    checksum_sha256: str = ""
    """SHA-256 hex digest of the file for integrity verification."""

    minimum_version: str = "0.0.0"
    """The oldest version that can safely upgrade to this release.
    If the current version is older, suggest a fresh install instead."""

    def to_dict(self) -> dict[str, str]:
        return {
            "download_url": self.download_url,
            "checksum_sha256": self.checksum_sha256,
            "minimum_version": self.minimum_version,
        }

    @classmethod
    def from_dict(cls, data: dict[str, str]) -> "PlatformAsset":
        return cls(
            download_url=data.get("download_url", ""),
            checksum_sha256=data.get("checksum_sha256", ""),
            minimum_version=data.get("minimum_version", "0.0.0"),
        )


@dataclass
class VersionManifest:
    """Represents the full version.json hosted on GitHub Releases.

    JSON Schema (example):
    ```json
    {
      "version": "1.1.0",
      "release_notes": "Bug fixes and performance improvements",
      "release_date": "2026-07-01",
      "platforms": {
        "windows": {
          "download_url": "https://github.com/owner/repo/releases/download/v1.1.0/app-setup.exe",
          "checksum_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "minimum_version": "1.0.0"
        },
        "android": {
          "download_url": "https://github.com/owner/repo/releases/download/v1.1.0/app-release.apk",
          "checksum_sha256": "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
          "minimum_version": "1.0.0"
        }
      }
    }
    ```
    """

    version: str
    """Semantic version string for this release (e.g. \"1.1.0\")."""

    release_notes: str = ""
    """Human-readable release notes / changelog snippet."""

    release_date: str = ""
    """ISO-8601 date string (e.g. \"2026-07-01\")."""

    platforms: dict[str, PlatformAsset] = field(default_factory=dict)
    """Map of platform keys (\"windows\", \"android\") to their release assets."""

    @classmethod
    def from_json(cls, raw: dict[str, Any]) -> "VersionManifest":
        platforms_raw: dict[str, Any] = raw.get("platforms", {})
        platforms = {
            key: PlatformAsset.from_dict(val)
            for key, val in platforms_raw.items()
        }
        return cls(
            version=raw.get("version", "0.0.0"),
            release_notes=raw.get("release_notes", ""),
            release_date=raw.get("release_date", ""),
            platforms=platforms,
        )

    def to_json(self, indent: int = 2) -> str:
        """Serialise this manifest to a pretty-printed JSON string."""
        data: dict[str, Any] = {
            "version": self.version,
            "release_notes": self.release_notes,
            "release_date": self.release_date,
            "platforms": {
                key: asset.to_dict() for key, asset in self.platforms.items()
            },
        }
        return json.dumps(data, indent=indent, ensure_ascii=False)


# ===================================================================
# 2.  Platform Detection
# ===================================================================


def detect_platform() -> str:
    """Return a normalised platform key: ``"windows"`` or ``"android"``.

    Falls back to ``"unknown"`` for unsupported platforms (macOS, Linux
    desktop, etc.) — the updater will skip silently.
    """
    if sys.platform.startswith("win32"):
        return "windows"
    # Android detection: BeeWare/PyDroid/Kivy set ANDROID_ROOT or ANDROID_ARGUMENT
    if "ANDROID_ROOT" in os.environ or "ANDROID_ARGUMENT" in os.environ:
        return "android"
    if platform.machine().startswith("aarch64") and "linux" in sys.platform:
        # Some Python-for-Android builds report aarch64 + linux
        if os.environ.get("PYTHON_SERVICE_ARGUMENT"):
            return "android"
    return "unknown"


# ===================================================================
# 3.  Version Comparison  (packaging.version — proper semver pinning)
# ===================================================================


def parse_version(version_str: str) -> Optional[Version]:
    """Safely parse a version string into a ``packaging.version.Version``.

    Returns ``None`` (and logs a warning) if the string is not a valid
    PEP 440 / semantic version.
    """
    try:
        return Version(version_str)
    except (InvalidVersion, TypeError, ValueError):
        logger.warning("Cannot parse version string '%s' — treating as 0.0.0", version_str)
        return None


def is_update_available(
    current_version: str,
    latest_version: str,
    minimum_version: str = "0.0.0",
) -> bool:
    """Compare versions using PEP 440 semantics (``packaging.version``).

    Args:
        current_version: The version the user is running.
        latest_version:  The version advertised in version.json.
        minimum_version: The oldest version that can upgrade to *latest*.
                         If *current* is below this, the update requires a
                         full reinstall rather than a patch.

    Returns:
        ``True`` if an in-place update is safe and recommended.
    """
    current = parse_version(current_version)
    latest = parse_version(latest_version)
    minimum = parse_version(minimum_version)

    if current is None or latest is None:
        return False  # Can't compare — bail safely

    if current >= latest:
        return False  # Already up-to-date

    if minimum is not None and current < minimum:
        logger.info(
            "Current version %s is below minimum %s for this release. "
            "A fresh install is required.",
            current_version,
            minimum_version,
        )
        # Return True so the caller can still offer to download,
        # but with a note that it's a major upgrade / fresh install.
        return True

    return True


# ===================================================================
# 4.  Download & Integrity
# ===================================================================


def download_file(
    url: str,
    dest_path: Path,
    expected_sha256: str = "",
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> bool:
    """Download a file from *url* to *dest_path* with optional SHA-256
    integrity verification.

    Args:
        url:              Direct download URL.
        dest_path:        Local path to save the downloaded file.
        expected_sha256:  If non-empty, verify the downloaded file's SHA-256.
        progress_callback: Optional ``(downloaded_bytes, total_bytes)`` callback
                           called periodically during download.

    Returns:
        ``True`` on success, ``False`` on any network / checksum failure.
    """
    try:
        logger.info("Downloading %s -> %s", url, dest_path)
        response = requests.get(url, stream=True, timeout=300)
        response.raise_for_status()

        total = int(response.headers.get("content-length", 0))
        downloaded = 0
        sha256_hash = hashlib.sha256()

        dest_path.parent.mkdir(parents=True, exist_ok=True)
        with open(dest_path, "wb") as fh:
            for chunk in response.iter_content(chunk_size=64 * 1024):
                if not chunk:
                    break
                fh.write(chunk)
                sha256_hash.update(chunk)
                downloaded += len(chunk)
                if progress_callback and total > 0:
                    progress_callback(downloaded, total)

        actual_checksum = sha256_hash.hexdigest()
        logger.info("Downloaded %d bytes — SHA-256: %s", downloaded, actual_checksum)

        if expected_sha256 and actual_checksum.lower() != expected_sha256.lower():
            logger.error(
                "Checksum mismatch! Expected %s, got %s",
                expected_sha256.lower(),
                actual_checksum,
            )
            # Remove the corrupt file
            dest_path.unlink(missing_ok=True)
            return False

        logger.info("Download completed successfully: %s", dest_path)
        return True

    except requests.RequestException as exc:
        logger.error("Download failed for %s: %s", url, exc)
        dest_path.unlink(missing_ok=True)
        return False
    except OSError as exc:
        logger.error("File I/O error writing %s: %s", dest_path, exc)
        return False


# ===================================================================
# 5.  Platform-Specific Install Logic
# ===================================================================


def install_windows(
    installer_path: Path,
    silent_flag: str = "/S",
) -> bool:
    """Launch the downloaded .exe installer silently.

    Uses ``subprocess.Popen`` (non-blocking) and detaches the process so
    the updater thread can exit cleanly.

    Args:
        installer_path: Path to the downloaded installer.
        silent_flag:    CLI flag for silent installation.  Default ``"/S"``
                        (NSIS / Inno Setup convention).  Use ``"/quiet"`` for
                        MSI-based installers, ``"--unattended"`` for WiX, etc.
    """
    if not installer_path.is_file():
        logger.error("Installer not found: %s", installer_path)
        return False

    try:
        logger.info(
            "Launching Windows installer: %s (flag=%s)",
            installer_path,
            silent_flag,
        )
        subprocess.Popen(
            [str(installer_path), silent_flag],
            shell=False,
            close_fds=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except (OSError, subprocess.SubprocessError) as exc:
        logger.error("Failed to launch installer: %s", exc)
        return False


def install_android(apk_path: Path) -> bool:
    """Install an APK via Android's PackageInstaller intent.

    Uses ``pyjnius`` (recommended for Kivy / BeeWare / PyDroid projects)
    to invoke the system installer. Falls back to a ``pm install`` shell
    command if pyjnius is not available.
    """
    if not apk_path.is_file():
        logger.error("APK not found: %s", apk_path)
        return False

    # --- Attempt pyjnius route (preferred) ---
    # Requires: pip install pyjnius
    try:
        # pyjnius is the standard bridge for Kivy / BeeWare Android apps.
        # It exposes the Java JNI layer so you can call Android SDK APIs.
        from jnius import autoclass  # type: ignore[import-untyped]

        PythonActivity = autoclass("org.kivy.android.PythonActivity")
        Intent = autoclass("android.content.Intent")
        Uri = autoclass("android.net.Uri")
        Build = autoclass("android.os.Build")
        FileProvider = autoclass("android.support.v4.content.FileProvider")

        current_activity = PythonActivity.mActivity
        package_name = current_activity.getPackageName()

        # On newer Android (N+), use a FileProvider URI to bypass
        # the "file:// URI exposure" restriction.
        if Build.VERSION.SDK_INT >= 24:
            apk_uri = FileProvider.getUriForFile(
                current_activity,
                f"{package_name}.fileprovider",
                str(apk_path),
            )
        else:
            # resolve() converts the relative Path to an absolute one
            apk_uri = Uri.fromFile(str(apk_path.resolve()))

        install_intent = Intent(Intent.ACTION_VIEW).setDataAndType(
            apk_uri, "application/vnd.android.package-archive"
        )
        install_intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        install_intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

        current_activity.startActivity(install_intent)
        logger.info("Android PackageInstaller intent dispatched for %s", apk_path)
        return True

    except ImportError:
        logger.info("pyjnius not available — falling back to 'pm install' shell command.")
    except Exception as exc:
        logger.warning("pyjnius install failed (%s) — trying 'pm install' fallback.", exc)

    # --- Fallback: 'pm install' shell command ---
    try:
        result = subprocess.run(
            ["pm", "install", "-r", str(apk_path)],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if result.returncode == 0:
            logger.info("APK installed via pm install: %s", apk_path)
            return True
        else:
            logger.error(
                "pm install failed (exit %d): %s",
                result.returncode,
                result.stderr.strip(),
            )
            return False
    except (OSError, subprocess.SubprocessError, subprocess.TimeoutExpired) as exc:
        logger.error("pm install invocation failed: %s", exc)
        return False


# ===================================================================
# 6.  Fetch & Parse Remote Manifest
# ===================================================================

# Default GitHub URL template — uses the "latest" release's tag to fetch
# the version.json asset.  Users can override via ``github_repo``.
_GITHUB_RELEASE_URL = "https://github.com/{repo}/releases/latest/download/{filename}"
_GITHUB_API_URL = "https://api.github.com/repos/{repo}/releases/latest"


def fetch_manifest(
    github_repo: str,
    version_filename: str = "version.json",
    timeout: int = 15,
) -> Optional[VersionManifest]:
    """Download and parse the version manifest from GitHub Releases.

    Strategy (two attempts):
      1. Direct-attach download via ``/releases/latest/download/version.json``.
      2. Falls back to the GitHub API to find the asset if #1 fails.

    Returns ``None`` (and logs a warning) on any error — the caller should
    **never** crash as a result.
    """
    if not REQUESTS_AVAILABLE:
        logger.warning(
            "Cannot check for updates — 'requests' and 'packaging' are not installed. "
            "Run: pip install requests packaging"
        )
        return None

    # --- Attempt 1: Direct download (fast, no API token needed) ---
    direct_url = _GITHUB_RELEASE_URL.format(
        repo=github_repo, filename=version_filename
    )
    try:
        logger.debug("Fetching manifest from %s", direct_url)
        resp = requests.get(direct_url, timeout=timeout)
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        return VersionManifest.from_json(data)
    except requests.RequestException as exc:
        logger.debug("Direct download failed: %s — trying API fallback.", exc)
    except json.JSONDecodeError as exc:
        logger.warning("Invalid JSON in manifest from %s: %s", direct_url, exc)
        return None

    # --- Attempt 2: GitHub API (works if asset is uploaded as part of release) ---
    api_url = _GITHUB_API_URL.format(repo=github_repo)
    try:
        logger.debug("Fetching latest release metadata from %s", api_url)
        resp = requests.get(api_url, timeout=timeout)
        resp.raise_for_status()
        release_data: dict[str, Any] = resp.json()

        # Find the version.json asset in the release
        assets: list[dict[str, Any]] = release_data.get("assets", [])
        target_asset = next(
            (a for a in assets if a.get("name") == version_filename),
            None,
        )
        if target_asset is None:
            logger.warning(
                "No asset named '%s' found in the latest release.", version_filename
            )
            return None

        asset_url: str = target_asset["browser_download_url"]
        logger.debug("Fetching manifest asset from %s", asset_url)
        resp2 = requests.get(asset_url, timeout=timeout)
        resp2.raise_for_status()
        data = resp2.json()
        return VersionManifest.from_json(data)

    except requests.RequestException as exc:
        logger.warning(
            "Failed to fetch version manifest for %s: %s", github_repo, exc
        )
    except json.JSONDecodeError as exc:
        logger.warning("Invalid JSON in API response: %s", exc)

    return None


# ===================================================================
# 7.  High-Level API — check_for_updates()
# ===================================================================


def check_for_updates(
    current_version: str = "0.0.0",
    github_repo: str = "owner/repo",
    version_filename: str = "version.json",
    download_dir: Optional[Path] = None,
    on_update_available: Optional[Callable[[VersionManifest], None]] = None,
    on_error: Optional[Callable[[Exception], None]] = None,
    force_sync: bool = False,
    app_name: str = "Application",
    windows_silent_flag: str = "/S",
) -> None:
    """Check for updates and, if available, download & install the new version.

    **This function is non-blocking by default.** It spawns a daemon thread
    so your app initialisation is never held up by a network request.

    Args:
        current_version:  The version running locally (e.g. ``"1.0.0"``).
        github_repo:      GitHub repository in ``"owner/repo"`` format.
        version_filename: Name of the version manifest file on GitHub Releases.
        download_dir:     Directory to store downloaded installers / APKs.
                          Defaults to ``<app-data-dir>/updates/``.
        on_update_available:
            Optional callback invoked (from the background thread) when an
            update is found.  Receives the parsed ``VersionManifest``.
            If not provided, the updater will auto-download and install.
        on_error:
            Optional callback invoked with any exception that occurs during
            the check.  If not provided, errors are only logged.
        force_sync:
            If ``True``, run synchronously (blocking).  Default ``False``.
            Use for testing or for CLI tools where blocking is acceptable.
        app_name:
            Human-readable name for log messages.
        windows_silent_flag:
            Silent-install flag passed to the Windows installer.
            Default ``"/S"`` (NSIS / Inno Setup).  Use ``"/quiet"`` for MSI,
            ``"--unattended"`` for WiX, etc.
    """
    if not REQUESTS_AVAILABLE:
        logger.warning("'requests' and/or 'packaging' are missing — skipping update check.")
        if on_error:
            on_error(RuntimeError("Missing dependencies: requests, packaging"))
        return

    if force_sync:
        _do_check(
            current_version=current_version,
            github_repo=github_repo,
            version_filename=version_filename,
            download_dir=download_dir,
            on_update_available=on_update_available,
            on_error=on_error,
            app_name=app_name,
            windows_silent_flag=windows_silent_flag,
        )
    else:
        # Daemon thread — won't block app shutdown
        thread = threading.Thread(
            target=_do_check,
            kwargs={
                "current_version": current_version,
                "github_repo": github_repo,
                "version_filename": version_filename,
                "download_dir": download_dir,
                "on_update_available": on_update_available,
                "on_error": on_error,
                "app_name": app_name,
                "windows_silent_flag": windows_silent_flag,
            },
            daemon=True,
        )
        thread.start()
        logger.debug("Update check dispatched in background thread.")


def _do_check(
    current_version: str,
    github_repo: str,
    version_filename: str,
    download_dir: Optional[Path],
    on_update_available: Optional[Callable[[VersionManifest], None]],
    on_error: Optional[Callable[[Exception], None]],
    app_name: str,
    windows_silent_flag: str = "/S",
) -> None:
    """Internal — performs the actual update check synchronously."""
    try:
        platform_key = detect_platform()
        logger.debug("Detected platform: %s", platform_key)

        if platform_key == "unknown":
            logger.info(
                "%s — update checks are only supported on Windows and Android. "
                "Skipping.",
                app_name,
            )
            return

        # 1. Fetch remote manifest
        manifest = fetch_manifest(github_repo, version_filename)
        if manifest is None:
            logger.info(
                "%s — no version manifest found. "
                "The app will continue normally without an update check.",
                app_name,
            )
            return

        logger.info(
            "%s — remote version: %s | local version: %s",
            app_name,
            manifest.version,
            current_version,
        )

        # 2. Compare versions
        if not is_update_available(current_version, manifest.version):
            logger.info("%s is up-to-date (v%s).", app_name, current_version)
            return

        # 3. Check if this platform has an asset
        platform_asset = manifest.platforms.get(platform_key)
        if platform_asset is None:
            logger.warning(
                "Update available (v%s) but no asset for '%s' in the manifest.",
                manifest.version,
                platform_key,
            )
            return

        # 4. Custom callback or auto-download + install
        if on_update_available is not None:
            on_update_available(manifest)
            return

        # 5. Auto-download
        if download_dir is None:
            # Use a system-appropriate cache directory
            if platform_key == "windows":
                base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
            else:
                base = Path.home() / ".cache"
            download_dir = base / app_name.lower().replace(" ", "-") / "updates"

        dest = download_dir / f"{app_name.lower().replace(' ', '-')}-v{manifest.version}.{_asset_ext(platform_key)}"
        success = download_file(
            url=platform_asset.download_url,
            dest_path=dest,
            expected_sha256=platform_asset.checksum_sha256,
        )
        if not success:
            logger.error("Download failed — update aborted.")
            return

        # 6. Trigger platform-specific install
        if platform_key == "windows":
            install_windows(dest, silent_flag=windows_silent_flag)
        elif platform_key == "android":
            install_android(dest)

        logger.info("Update to v%s has been staged/launched.", manifest.version)

    except Exception as exc:
        logger.exception("Update check failed unexpectedly: %s", exc)
        if on_error:
            on_error(exc)


def _asset_ext(platform_key: str) -> str:
    """Return the file extension for the given platform."""
    return {"windows": "exe", "android": "apk"}.get(platform_key, "bin")


# ===================================================================
# 8.  Standalone Test / CLI
# ===================================================================


def main() -> None:
    """Run once synchronously from the command line for testing."""
    import argparse

    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    parser = argparse.ArgumentParser(
        description="Check for application updates using a GitHub-hosted version manifest."
    )
    parser.add_argument(
        "--current-version",
        default="0.0.0",
        help="The locally installed version (default: 0.0.0)",
    )
    parser.add_argument(
        "--repo",
        default="owner/repo",
        help="GitHub repository in 'owner/repo' format (default: owner/repo)",
    )
    parser.add_argument(
        "--manifest",
        default="version.json",
        help="Name of the version manifest file on GitHub (default: version.json)",
    )
    parser.add_argument(
        "--app-name",
        default="Application",
        help="Human-readable app name for logging (default: Application)",
    )
    parser.add_argument(
        "--sync",
        action="store_true",
        default=True,
        help="Run synchronously (default: True for CLI)",
    )
    args = parser.parse_args()

    check_for_updates(
        current_version=args.current_version,
        github_repo=args.repo,
        version_filename=args.manifest,
        app_name=args.app_name,
        force_sync=args.sync,
    )

    # Give background thread a moment to complete in non-sync mode
    if not args.sync:
        time.sleep(3)


if __name__ == "__main__":
    main()
