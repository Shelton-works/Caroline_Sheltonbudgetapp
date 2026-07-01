"""
test_updater.py — Comprehensive unit tests for the auto-update module.

Run with:
    pytest backend/test_updater.py -v

Or from the backend directory:
    pytest test_updater.py -v
"""

from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, call, patch

import pytest

# Ensure the updater module's dependencies are importable before the module
# is imported (otherwise REQUESTS_AVAILABLE will be False).
# We import the module itself via a fixture that patches imports where needed.

MODULE = "backend.updater"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


SAMPLE_MANIFEST_RAW = {
    "version": "1.1.0",
    "release_notes": "Bug fixes",
    "release_date": "2026-07-01",
    "platforms": {
        "windows": {
            "download_url": "https://github.com/owner/repo/releases/download/v1.1.0/app.exe",
            "checksum_sha256": "a" * 64,
            "minimum_version": "1.0.0",
        },
        "android": {
            "download_url": "https://github.com/owner/repo/releases/download/v1.1.0/app.apk",
            "checksum_sha256": "b" * 64,
            "minimum_version": "1.0.0",
        },
    },
}


# ---------------------------------------------------------------------------
# Fixtures — import updater lazily so we can patch dependencies first
# ---------------------------------------------------------------------------


@pytest.fixture
def updater():
    """Import and return the updater module (fresh each test)."""
    import importlib

    # Support running from both project root and backend/ directory
    try:
        if MODULE in sys.modules:
            del sys.modules[MODULE]
        import backend.updater as u  # type: ignore[import-untyped]
        return u
    except ModuleNotFoundError:
        if "updater" in sys.modules:
            del sys.modules["updater"]
        import updater  # type: ignore[import-untyped]
        return updater


# ===================================================================
# 1.  PlatformAsset
# ===================================================================


class TestPlatformAsset:
    def test_to_dict(self, updater):
        asset = updater.PlatformAsset(
            download_url="https://example.com/file.exe",
            checksum_sha256="abc123",
            minimum_version="1.0.0",
        )
        d = asset.to_dict()
        assert d == {
            "download_url": "https://example.com/file.exe",
            "checksum_sha256": "abc123",
            "minimum_version": "1.0.0",
        }

    def test_from_dict_full(self, updater):
        asset = updater.PlatformAsset.from_dict(
            {
                "download_url": "https://example.com/file.exe",
                "checksum_sha256": "abc123",
                "minimum_version": "1.0.0",
            }
        )
        assert asset.download_url == "https://example.com/file.exe"
        assert asset.checksum_sha256 == "abc123"
        assert asset.minimum_version == "1.0.0"

    def test_from_dict_missing_fields(self, updater):
        """Missing fields should fall back to defaults."""
        asset = updater.PlatformAsset.from_dict({"download_url": "https://u"})
        assert asset.download_url == "https://u"
        assert asset.checksum_sha256 == ""
        assert asset.minimum_version == "0.0.0"

    def test_from_dict_empty(self, updater):
        asset = updater.PlatformAsset.from_dict({})
        assert asset.download_url == ""
        assert asset.checksum_sha256 == ""
        assert asset.minimum_version == "0.0.0"

    def test_round_trip(self, updater):
        original = updater.PlatformAsset(
            download_url="https://u/file.msi",
            checksum_sha256="deadbeef",
            minimum_version="2.0.0",
        )
        restored = updater.PlatformAsset.from_dict(original.to_dict())
        assert restored == original


# ===================================================================
# 2.  VersionManifest
# ===================================================================


class TestVersionManifest:
    def test_from_json_full(self, updater):
        manifest = updater.VersionManifest.from_json(SAMPLE_MANIFEST_RAW)
        assert manifest.version == "1.1.0"
        assert manifest.release_notes == "Bug fixes"
        assert manifest.release_date == "2026-07-01"
        assert "windows" in manifest.platforms
        assert "android" in manifest.platforms
        assert manifest.platforms["windows"].download_url.endswith("app.exe")
        assert manifest.platforms["android"].minimum_version == "1.0.0"

    def test_from_json_empty_platforms(self, updater):
        manifest = updater.VersionManifest.from_json(
            {"version": "1.0.0", "platforms": {}}
        )
        assert manifest.platforms == {}

    def test_from_json_missing_version(self, updater):
        manifest = updater.VersionManifest.from_json({})
        assert manifest.version == "0.0.0"
        assert manifest.platforms == {}

    def test_to_json_round_trip(self, updater):
        manifest = updater.VersionManifest.from_json(SAMPLE_MANIFEST_RAW)
        dumped = manifest.to_json()
        parsed = json.loads(dumped)
        assert parsed["version"] == "1.1.0"
        assert parsed["platforms"]["windows"]["checksum_sha256"] == "a" * 64

    def test_to_json_pretty_print(self, updater):
        manifest = updater.VersionManifest.from_json(SAMPLE_MANIFEST_RAW)
        dumped = manifest.to_json()
        # Should be pretty-printed with newlines
        assert "\n" in dumped
        assert "  " in dumped


# ===================================================================
# 3.  detect_platform
# ===================================================================


class TestDetectPlatform:
    @patch(f"{MODULE}.sys", wraps=sys)
    def test_windows(self, mock_sys, updater):
        mock_sys.platform = "win32"
        assert updater.detect_platform() == "windows"

    @patch(f"{MODULE}.sys", wraps=sys)
    def test_windows_cygwin(self, mock_sys, updater):
        """Cygwin reports 'cygwin' — still 'unknown' since we only match 'win32'."""
        mock_sys.platform = "cygwin"
        assert updater.detect_platform() == "unknown"

    @patch.dict(os.environ, {"ANDROID_ROOT": "/data"})
    @patch(f"{MODULE}.sys", wraps=sys)
    def test_android_via_root_env(self, mock_sys, updater):
        mock_sys.platform = "linux"
        assert updater.detect_platform() == "android"

    @patch.dict(os.environ, {"ANDROID_ARGUMENT": "1"})
    @patch(f"{MODULE}.sys", wraps=sys)
    def test_android_via_argument_env(self, mock_sys, updater):
        mock_sys.platform = "linux"
        assert updater.detect_platform() == "android"

    @patch.dict(os.environ, {"PYTHON_SERVICE_ARGUMENT": "1"})
    @patch(f"{MODULE}.platform", wraps=platform)
    @patch(f"{MODULE}.sys", wraps=sys)
    def test_android_via_aarch64(self, mock_sys, mock_platform, updater):
        mock_sys.platform = "linux"
        mock_platform.machine.return_value = "aarch64"
        assert updater.detect_platform() == "android"

    @patch(f"{MODULE}.sys", wraps=sys)
    def test_macos(self, mock_sys, updater):
        mock_sys.platform = "darwin"
        assert updater.detect_platform() == "unknown"

    @patch(f"{MODULE}.sys", wraps=sys)
    @patch(f"{MODULE}.platform", wraps=platform)
    def test_linux_desktop(self, mock_platform, mock_sys, updater):
        mock_sys.platform = "linux"
        mock_platform.machine.return_value = "x86_64"
        assert updater.detect_platform() == "unknown"

    @patch.dict(os.environ, {}, clear=True)
    @patch(f"{MODULE}.sys", wraps=sys)
    @patch(f"{MODULE}.platform", wraps=platform)
    def test_no_env_vars_linux_aarch64(self, mock_platform, mock_sys, updater):
        """aarch64 Linux without PYTHON_SERVICE_ARGUMENT should NOT be Android."""
        mock_sys.platform = "linux"
        mock_platform.machine.return_value = "aarch64"
        assert updater.detect_platform() == "unknown"


# ===================================================================
# 4.  parse_version
# ===================================================================


class TestParseVersion:
    def test_valid_semver(self, updater):
        v = updater.parse_version("1.2.3")
        assert v is not None
        assert v.major == 1
        assert v.minor == 2
        assert v.micro == 3

    def test_valid_pep440(self, updater):
        v = updater.parse_version("1.0.0a1")
        assert v is not None

    def test_valid_simple(self, updater):
        v = updater.parse_version("1.0")
        assert v is not None

    def test_invalid_string(self, updater):
        v = updater.parse_version("not-a-version")
        assert v is None

    def test_empty_string(self, updater):
        v = updater.parse_version("")
        assert v is None

    def test_none_input(self, updater):
        v = updater.parse_version(None)  # type: ignore[arg-type]
        assert v is None


# ===================================================================
# 5.  is_update_available
# ===================================================================


class TestIsUpdateAvailable:
    def test_update_available(self, updater):
        assert updater.is_update_available("1.0.0", "1.1.0") is True

    def test_already_up_to_date(self, updater):
        assert updater.is_update_available("1.1.0", "1.1.0") is False

    def test_current_ahead(self, updater):
        assert updater.is_update_available("2.0.0", "1.1.0") is False

    def test_below_minimum(self, updater):
        """Current version is below minimum_version -> still returns True (needs reinstall)."""
        assert updater.is_update_available("0.9.0", "1.1.0", "1.0.0") is True

    def test_at_minimum(self, updater):
        assert updater.is_update_available("1.0.0", "1.1.0", "1.0.0") is True

    def test_above_minimum(self, updater):
        assert updater.is_update_available("1.0.5", "1.1.0", "1.0.0") is True

    def test_unparseable_current(self, updater):
        """If current version can't be parsed, bail safe -> False."""
        assert updater.is_update_available("invalid", "1.1.0") is False

    def test_unparseable_latest(self, updater):
        assert updater.is_update_available("1.0.0", "bad") is False

    def test_both_unparseable(self, updater):
        assert updater.is_update_available("bad1", "bad2") is False

    def test_prerelease_less_than_release(self, updater):
        assert updater.is_update_available("1.0.0a1", "1.0.0") is True

    def test_prerelease_greater(self, updater):
        assert updater.is_update_available("1.0.0", "1.0.0a1") is False


# ===================================================================
# 6.  _asset_ext
# ===================================================================


class TestAssetExt:
    def test_windows(self, updater):
        assert updater._asset_ext("windows") == "exe"

    def test_android(self, updater):
        assert updater._asset_ext("android") == "apk"

    def test_unknown(self, updater):
        assert updater._asset_ext("unknown") == "bin"

    def test_unsupported(self, updater):
        assert updater._asset_ext("darwin") == "bin"


# ===================================================================
# 7.  download_file
# ===================================================================


class TestDownloadFile:
    def _mock_response(self, content=b"test", status_ok=True):
        """Helper to create a mock requests.Response."""
        mock_resp = MagicMock()
        mock_resp.headers.get.return_value = str(len(content))
        mock_resp.iter_content.return_value = [content]
        if not status_ok:
            mock_resp.raise_for_status.side_effect = Exception("HTTP error")
        return mock_resp

    @patch(f"{MODULE}.requests.get")
    def test_success_no_checksum(self, mock_get, updater, tmp_path):
        """Download succeeds without checksum verification."""
        mock_get.return_value = self._mock_response(b"test")

        dest = tmp_path / "downloaded.exe"
        result = updater.download_file("https://u/file.exe", dest)

        assert result is True
        assert dest.read_bytes() == b"test"

    @patch(f"{MODULE}.requests.get")
    def test_success_with_matching_checksum(self, mock_get, updater, tmp_path):
        """Download succeeds when checksum matches."""
        content = b"hello world"
        expected_sha = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        mock_get.return_value = self._mock_response(content)

        dest = tmp_path / "file.bin"
        result = updater.download_file("https://u/file.bin", dest, expected_sha)

        assert result is True
        assert dest.read_bytes() == content

    @patch(f"{MODULE}.requests.get")
    def test_checksum_mismatch(self, mock_get, updater, tmp_path):
        """Downloaded file is deleted on checksum mismatch."""
        content = b"hello world"
        wrong_sha = "f" * 64
        mock_get.return_value = self._mock_response(content)

        dest = tmp_path / "corrupt.bin"
        result = updater.download_file("https://u/file.bin", dest, wrong_sha)

        assert result is False
        assert not dest.exists()

    @patch(f"{MODULE}.requests.get")
    def test_network_error(self, mock_get, updater, tmp_path):
        """Network failure returns False."""
        mock_get.side_effect = OSError("connection refused")

        dest = tmp_path / "fail.bin"
        result = updater.download_file("https://u/file.bin", dest)

        assert result is False

    @patch(f"{MODULE}.requests.get")
    def test_progress_callback(self, mock_get, updater, tmp_path):
        """Progress callback receives (downloaded, total) pairs."""
        content = b"x" * 1024 * 64 * 2  # 2 chunks
        mock_resp = MagicMock()
        mock_resp.headers.get.return_value = str(len(content))
        mock_resp.iter_content.return_value = [content[: 1024 * 64], content[1024 * 64 :]]
        mock_get.return_value = mock_resp

        dest = tmp_path / "progress.bin"
        progress_log: list[tuple[int, int]] = []

        def cb(dl, total):
            progress_log.append((dl, total))

        result = updater.download_file("https://u/file.bin", dest, progress_callback=cb)

        assert result is True
        assert len(progress_log) >= 1
        # Last call should report total downloaded == total size
        assert progress_log[-1] == (len(content), len(content))

    @patch(f"{MODULE}.requests.get")
    def test_http_error(self, mock_get, updater, tmp_path):
        """HTTP error (via raise_for_status) returns False."""
        from requests import HTTPError

        mock_resp = MagicMock()
        mock_resp.headers.get.return_value = "0"
        mock_resp.iter_content.return_value = [b""]
        mock_resp.raise_for_status.side_effect = HTTPError("404")
        mock_get.return_value = mock_resp

        dest = tmp_path / "gone.bin"
        result = updater.download_file("https://u/gone.bin", dest)

        assert result is False


# ===================================================================
# 8.  install_windows
# ===================================================================


class TestInstallWindows:
    @patch(f"{MODULE}.subprocess.Popen")
    def test_installer_found_default_flag(self, mock_popen, updater, tmp_path):
        """Default silent flag is '/S' (NSIS/Inno Setup)."""
        installer = tmp_path / "setup.exe"
        installer.write_text("fake exe")

        result = updater.install_windows(installer)

        assert result is True
        mock_popen.assert_called_once_with(
            [str(installer), "/S"],
            shell=False,
            close_fds=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    @patch(f"{MODULE}.subprocess.Popen")
    def test_installer_found_custom_flag(self, mock_popen, updater, tmp_path):
        """Custom silent flag is forwarded correctly."""
        installer = tmp_path / "setup.msi"
        installer.write_text("fake msi")

        result = updater.install_windows(installer, silent_flag="/quiet")

        assert result is True
        mock_popen.assert_called_once_with(
            [str(installer), "/quiet"],
            shell=False,
            close_fds=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    @patch(f"{MODULE}.subprocess.Popen")
    def test_installer_found_unattended_flag(self, mock_popen, updater, tmp_path):
        """WiX-style unattended flag works."""
        installer = tmp_path / "setup.exe"
        installer.write_text("content")

        result = updater.install_windows(installer, silent_flag="--unattended")

        assert result is True
        mock_popen.assert_called_once_with(
            [str(installer), "--unattended"],
            shell=False,
            close_fds=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def test_installer_missing(self, updater, tmp_path):
        installer = tmp_path / "nonexistent.exe"
        result = updater.install_windows(installer)
        assert result is False

    @patch(f"{MODULE}.subprocess.Popen")
    def test_subprocess_error(self, mock_popen, updater, tmp_path):
        installer = tmp_path / "setup.exe"
        installer.write_text("exe content")
        mock_popen.side_effect = OSError("Access denied")

        result = updater.install_windows(installer)
        assert result is False


# ===================================================================
# 9.  install_android
# ===================================================================


class TestInstallAndroid:
    def test_apk_missing(self, updater, tmp_path):
        apk = tmp_path / "nonexistent.apk"
        result = updater.install_android(apk)
        assert result is False

    @patch(f"{MODULE}.subprocess.run")
    def test_pm_install_fallback_success(self, mock_run, updater, tmp_path):
        """When pyjnius is absent, falls back to pm install (success)."""
        apk = tmp_path / "app.apk"
        apk.write_text("fake apk")

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_run.return_value = mock_result

        result = updater.install_android(apk)

        assert result is True
        mock_run.assert_called_once_with(
            ["pm", "install", "-r", str(apk)],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )

    @patch(f"{MODULE}.subprocess.run")
    def test_pm_install_fallback_failure(self, mock_run, updater, tmp_path):
        """pm install non-zero exit -> False."""
        apk = tmp_path / "app.apk"
        apk.write_text("content")

        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = "INSTALL_FAILED"
        mock_run.return_value = mock_result

        result = updater.install_android(apk)
        assert result is False

    @patch(f"{MODULE}.subprocess.run")
    def test_pm_install_timeout(self, mock_run, updater, tmp_path):
        """pm install timeout -> False."""
        apk = tmp_path / "app.apk"
        apk.write_text("content")

        mock_run.side_effect = subprocess.TimeoutExpired(cmd="pm install", timeout=120)

        result = updater.install_android(apk)
        assert result is False

    @patch(f"{MODULE}.subprocess.run")
    def test_pm_install_oserror(self, mock_run, updater, tmp_path):
        """OSError during pm install -> False."""
        apk = tmp_path / "app.apk"
        apk.write_text("content")

        mock_run.side_effect = OSError("No such file")

        result = updater.install_android(apk)
        assert result is False


# ===================================================================


class TestFetchManifest:
    @patch(f"{MODULE}.requests.get")
    def test_direct_download_success(self, mock_get, updater):
        """Direct download succeeds -> returns parsed manifest."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = SAMPLE_MANIFEST_RAW
        mock_get.return_value = mock_resp

        manifest = updater.fetch_manifest("owner/repo", "version.json")

        assert manifest is not None
        assert manifest.version == "1.1.0"
        mock_get.assert_called_once_with(
            "https://github.com/owner/repo/releases/latest/download/version.json",
            timeout=15,
        )

    @patch(f"{MODULE}.requests.get")
    def test_direct_fails_api_succeeds(self, mock_get, updater):
        """Direct download fails -> falls back to GitHub API."""
        from requests import RequestException

        # Simulate a requests.RequestException on the first get() call
        def side_effect(url, **kwargs):
            if "latest/download" in url:
                raise RequestException("404")
            # API call returns release metadata
            if "api.github.com" in url:
                api_resp = MagicMock()
                api_resp.json.return_value = {
                    "assets": [
                        {
                            "name": "version.json",
                            "browser_download_url": "https://github.com/owner/repo/releases/download/v1.1.0/version.json",
                        }
                    ]
                }
                return api_resp
            # Asset download returns the manifest
            asset_resp = MagicMock()
            asset_resp.json.return_value = SAMPLE_MANIFEST_RAW
            return asset_resp

        mock_get.side_effect = side_effect

        manifest = updater.fetch_manifest("owner/repo")

        assert manifest is not None
        assert manifest.version == "1.1.0"
        assert mock_get.call_count == 3

    @patch(f"{MODULE}.requests.get")
    def test_direct_api_asset_not_found(self, mock_get, updater):
        """Direct fails, API succeeds but no version.json asset -> None."""
        from requests import RequestException

        def side_effect(url, **kwargs):
            if "latest/download" in url:
                raise RequestException("404")
            api_resp = MagicMock()
            api_resp.json.return_value = {"assets": []}
            return api_resp

        mock_get.side_effect = side_effect

        manifest = updater.fetch_manifest("owner/repo")
        assert manifest is None

    @patch(f"{MODULE}.requests.get")
    def test_both_fail(self, mock_get, updater):
        """Both direct and API fail -> None."""
        from requests import RequestException

        mock_get.side_effect = RequestException("network error")

        manifest = updater.fetch_manifest("owner/repo")
        assert manifest is None

    @patch(f"{MODULE}.requests.get")
    def test_invalid_json(self, mock_get, updater):
        """Non-JSON response -> None."""
        mock_resp = MagicMock()
        mock_resp.json.side_effect = json.JSONDecodeError("bad json", "", 0)
        mock_get.return_value = mock_resp

        manifest = updater.fetch_manifest("owner/repo")
        assert manifest is None

    @patch(f"{MODULE}.REQUESTS_AVAILABLE", False)
    def test_requests_not_available(self, updater):
        """If REQUESTS_AVAILABLE is False, return None."""
        manifest = updater.fetch_manifest("owner/repo")
        assert manifest is None


# ===================================================================
# 11.  check_for_updates
# ===================================================================


class TestCheckForUpdates:
    @patch(f"{MODULE}._do_check")
    def test_force_sync_calls_do_check(self, mock_do_check, updater):
        """force_sync=True calls _do_check directly."""
        updater.check_for_updates(
            current_version="1.0.0",
            github_repo="owner/repo",
            force_sync=True,
        )
        mock_do_check.assert_called_once_with(
            current_version="1.0.0",
            github_repo="owner/repo",
            version_filename="version.json",
            download_dir=None,
            on_update_available=None,
            on_error=None,
            app_name="Application",
            windows_silent_flag="/S",
        )

    @patch(f"{MODULE}._do_check")
    def test_force_sync_passes_callbacks(self, mock_do_check, updater):
        """All keyword args are forwarded to _do_check."""
        cb = MagicMock()
        err_cb = MagicMock()
        updater.check_for_updates(
            current_version="1.0.0",
            github_repo="owner/repo",
            version_filename="v.json",
            download_dir=Path("/tmp/updates"),
            on_update_available=cb,
            on_error=err_cb,
            force_sync=True,
            app_name="TestApp",
        )
        mock_do_check.assert_called_once_with(
            current_version="1.0.0",
            github_repo="owner/repo",
            version_filename="v.json",
            download_dir=Path("/tmp/updates"),
            on_update_available=cb,
            on_error=err_cb,
            app_name="TestApp",
            windows_silent_flag="/S",
        )

    @patch(f"{MODULE}._do_check")
    def test_force_sync_custom_flag(self, mock_do_check, updater):
        """Custom windows_silent_flag is forwarded to _do_check."""
        updater.check_for_updates(
            current_version="1.0.0",
            github_repo="owner/repo",
            force_sync=True,
            windows_silent_flag="/quiet",
        )
        mock_do_check.assert_called_once_with(
            current_version="1.0.0",
            github_repo="owner/repo",
            version_filename="version.json",
            download_dir=None,
            on_update_available=None,
            on_error=None,
            app_name="Application",
            windows_silent_flag="/quiet",
        )

    @patch(f"{MODULE}.threading.Thread")
    @patch(f"{MODULE}._do_check")
    def test_non_blocking_spawns_thread(
        self, mock_do_check, mock_thread, updater
    ):
        """Default (force_sync=False) spawns a daemon thread."""
        mock_thread_instance = MagicMock()
        mock_thread.return_value = mock_thread_instance

        updater.check_for_updates(
            current_version="1.0.0",
            github_repo="owner/repo",
            force_sync=False,
            windows_silent_flag="/S",
        )

        mock_thread.assert_called_once()
        _, call_kwargs = mock_thread.call_args
        assert call_kwargs["daemon"] is True
        assert call_kwargs["target"] is updater._do_check
        assert call_kwargs["kwargs"]["windows_silent_flag"] == "/S"

    @patch(f"{MODULE}.REQUESTS_AVAILABLE", False)
    def test_missing_deps_calls_on_error(self, updater):
        """When requests/packaging are missing, on_error callback is invoked."""
        err_cb = MagicMock()
        updater.check_for_updates(
            current_version="1.0.0",
            github_repo="owner/repo",
            on_error=err_cb,
            force_sync=True,
        )
        err_cb.assert_called_once()
        assert isinstance(err_cb.call_args[0][0], RuntimeError)
        assert "Missing dependencies" in str(err_cb.call_args[0][0])

    @patch(f"{MODULE}.REQUESTS_AVAILABLE", False)
    def test_missing_deps_no_on_error_does_not_crash(self, updater):
        """When deps missing and no on_error set, just log."""
        # Should not raise
        updater.check_for_updates(
            current_version="1.0.0",
            github_repo="owner/repo",
            force_sync=True,
        )


# ===================================================================
# 12.  _do_check  (integration with mocked internals)
# ===================================================================


class TestDoCheck:
    @patch(f"{MODULE}.detect_platform", return_value="unknown")
    def test_unknown_platform_skips(self, mock_detect, updater):
        """Unknown platform logs and returns without error."""
        err_cb = MagicMock()
        updater._do_check(
            current_version="1.0.0",
            github_repo="owner/repo",
            version_filename="version.json",
            download_dir=None,
            on_update_available=None,
            on_error=err_cb,
            app_name="TestApp",
        )
        err_cb.assert_not_called()

    @patch(f"{MODULE}.detect_platform", return_value="windows")
    @patch(f"{MODULE}.fetch_manifest", return_value=None)
    def test_no_manifest_skips(self, mock_fetch, mock_detect, updater):
        """No manifest found -> skip without error."""
        err_cb = MagicMock()
        updater._do_check(
            current_version="1.0.0",
            github_repo="owner/repo",
            version_filename="version.json",
            download_dir=None,
            on_update_available=None,
            on_error=err_cb,
            app_name="TestApp",
        )
        err_cb.assert_not_called()

    @patch(f"{MODULE}.detect_platform", return_value="windows")
    @patch(f"{MODULE}.fetch_manifest")
    def test_up_to_date_skips(self, mock_fetch, mock_detect, updater):
        """Already up-to-date -> no download, no error."""
        manifest = updater.VersionManifest.from_json(
            {**SAMPLE_MANIFEST_RAW, "version": "1.0.0"}
        )
        mock_fetch.return_value = manifest

        err_cb = MagicMock()
        on_update = MagicMock()

        updater._do_check(
            current_version="1.0.0",
            github_repo="owner/repo",
            version_filename="version.json",
            download_dir=None,
            on_update_available=on_update,
            on_error=err_cb,
            app_name="TestApp",
        )
        on_update.assert_not_called()
        err_cb.assert_not_called()

    @patch(f"{MODULE}.detect_platform", return_value="windows")
    @patch(f"{MODULE}.fetch_manifest")
    def test_update_available_calls_callback(
        self, mock_fetch, mock_detect, updater
    ):
        """When on_update_available is set, it gets called instead of auto-download."""
        manifest = updater.VersionManifest.from_json(SAMPLE_MANIFEST_RAW)
        mock_fetch.return_value = manifest

        on_update = MagicMock()

        updater._do_check(
            current_version="1.0.0",
            github_repo="owner/repo",
            version_filename="version.json",
            download_dir=None,
            on_update_available=on_update,
            on_error=None,
            app_name="TestApp",
        )
        on_update.assert_called_once_with(manifest)

    @patch(f"{MODULE}.detect_platform", return_value="windows")
    @patch(f"{MODULE}.fetch_manifest")
    @patch(f"{MODULE}.download_file", return_value=True)
    @patch(f"{MODULE}.install_windows", return_value=True)
    def test_full_windows_update_flow(
        self, mock_install, mock_download, mock_fetch, mock_detect, updater
    ):
        """Full Windows update: detect -> fetch -> download -> install."""
        manifest = updater.VersionManifest.from_json(SAMPLE_MANIFEST_RAW)
        mock_fetch.return_value = manifest

        updater._do_check(
            current_version="1.0.0",
            github_repo="owner/repo",
            version_filename="version.json",
            download_dir=None,
            on_update_available=None,
            on_error=None,
            app_name="TestApp",
        )

        mock_download.assert_called_once()
        mock_install.assert_called_once()

    @patch(f"{MODULE}.detect_platform", return_value="windows")
    @patch(f"{MODULE}.fetch_manifest")
    @patch(f"{MODULE}.download_file", return_value=False)
    def test_download_failure_aborts(
        self, mock_download, mock_fetch, mock_detect, updater
    ):
        """If download fails, install is not called."""
        manifest = updater.VersionManifest.from_json(SAMPLE_MANIFEST_RAW)
        mock_fetch.return_value = manifest

        err_cb = MagicMock()

        updater._do_check(
            current_version="1.0.0",
            github_repo="owner/repo",
            version_filename="version.json",
            download_dir=None,
            on_update_available=None,
            on_error=err_cb,
            app_name="TestApp",
        )

        mock_download.assert_called_once()
        err_cb.assert_not_called()  # download failure is not an exception

    @patch(f"{MODULE}.detect_platform", return_value="windows")
    @patch(f"{MODULE}.fetch_manifest")
    def test_missing_platform_asset(self, mock_fetch, mock_detect, updater):
        """Update available but no asset for platform -> skip."""
        manifest = updater.VersionManifest.from_json(
            {**SAMPLE_MANIFEST_RAW, "platforms": {"macos": {"download_url": "https://u/macos.dmg"}}}
        )
        mock_fetch.return_value = manifest

        err_cb = MagicMock()

        updater._do_check(
            current_version="1.0.0",
            github_repo="owner/repo",
            version_filename="version.json",
            download_dir=None,
            on_update_available=None,
            on_error=err_cb,
            app_name="TestApp",
        )

        err_cb.assert_not_called()

    @patch(f"{MODULE}.detect_platform", return_value="windows")
    @patch(f"{MODULE}.fetch_manifest")
    def test_unexpected_exception_calls_on_error(
        self, mock_fetch, mock_detect, updater
    ):
        """Unexpected error calls on_error callback."""
        mock_fetch.side_effect = RuntimeError("boom")

        err_cb = MagicMock()

        updater._do_check(
            current_version="1.0.0",
            github_repo="owner/repo",
            version_filename="version.json",
            download_dir=None,
            on_update_available=None,
            on_error=err_cb,
            app_name="TestApp",
        )

        err_cb.assert_called_once()
        assert isinstance(err_cb.call_args[0][0], RuntimeError)

    @patch(f"{MODULE}.detect_platform", return_value="android")
    @patch(f"{MODULE}.fetch_manifest")
    @patch(f"{MODULE}.download_file", return_value=True)
    @patch(f"{MODULE}.install_android", return_value=True)
    def test_full_android_update_flow(
        self, mock_install, mock_download, mock_fetch, mock_detect, updater
    ):
        """Full Android update: detect -> fetch -> download -> install."""
        manifest = updater.VersionManifest.from_json(SAMPLE_MANIFEST_RAW)
        mock_fetch.return_value = manifest

        updater._do_check(
            current_version="1.0.0",
            github_repo="owner/repo",
            version_filename="version.json",
            download_dir=None,
            on_update_available=None,
            on_error=None,
            app_name="TestApp",
        )

        mock_download.assert_called_once()
        mock_install.assert_called_once()


# ===================================================================
# 13.  CLI main entry point
# ===================================================================


class TestMain:
    @patch(f"{MODULE}.check_for_updates")
    def test_main_defaults(self, mock_check, updater):
        """CLI entry point calls check_for_updates with sync=True."""
        with patch.object(sys, "argv", ["updater.py"]):
            result = updater.main()
            mock_check.assert_called_once_with(
                current_version="0.0.0",
                github_repo="owner/repo",
                version_filename="version.json",
                app_name="Application",
                force_sync=True,
            )

    @patch(f"{MODULE}.check_for_updates")
    def test_main_custom_args(self, mock_check, updater):
        """CLI parses custom arguments correctly."""
        with patch.object(
            sys,
            "argv",
            [
                "updater.py",
                "--current-version=1.5.0",
                "--repo=myuser/myrepo",
                "--manifest=update.json",
                "--app-name=MyApp",
                "--sync",
            ],
        ):
            updater.main()
            mock_check.assert_called_once_with(
                current_version="1.5.0",
                github_repo="myuser/myrepo",
                version_filename="update.json",
                app_name="MyApp",
                force_sync=True,
            )


# ===================================================================
# 14.  VersionManifest JSON helper edge cases
# ===================================================================


class TestVersionManifestEdgeCases:
    def test_from_json_partial_platform_asset(self, updater):
        """Platform asset with missing optional fields uses defaults."""
        raw = {
            "version": "1.0.0",
            "platforms": {
                "windows": {
                    "download_url": "https://u/file.exe"
                    # no checksum_sha256, no minimum_version
                }
            },
        }
        manifest = updater.VersionManifest.from_json(raw)
        asset = manifest.platforms["windows"]
        assert asset.checksum_sha256 == ""
        assert asset.minimum_version == "0.0.0"

    def test_from_json_extra_platforms_ignored(self, updater):
        """Extra platforms beyond windows/android are accepted but unused by updater."""
        raw = {
            "version": "1.0.0",
            "platforms": {
                "windows": {"download_url": "https://u/file.exe"},
                "linux": {"download_url": "https://u/file.AppImage"},
            },
        }
        manifest = updater.VersionManifest.from_json(raw)
        assert "linux" in manifest.platforms
        assert manifest.platforms["linux"].download_url.endswith("AppImage")
