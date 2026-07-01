"""
test_hash_release.py — Unit tests for the checksum helper script.

Run with:
    python -m pytest backend/test_hash_release.py -v
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

MODULE = "backend.hash_release"

# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def hr():
    """Import the hash_release module (fresh each test)."""
    import importlib

    if MODULE in sys.modules:
        del sys.modules[MODULE]
    import backend.hash_release as m  # type: ignore[import-untyped]

    return m


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------


class TestSha256File:
    def test_known_hash(self, hr, tmp_path):
        """SHA-256 of 'hello world' (no newline) produces the expected digest."""
        f = tmp_path / "test.bin"
        f.write_bytes(b"hello world")
        expected = hashlib.sha256(b"hello world").hexdigest()
        assert hr.sha256_file(f) == expected

    def test_empty_file(self, hr, tmp_path):
        f = tmp_path / "empty.bin"
        f.write_bytes(b"")
        assert hr.sha256_file(f) == hashlib.sha256(b"").hexdigest()

    def test_large_file_chunks(self, hr, tmp_path):
        """Verify that chunked reading produces the same hash as a single read."""
        content = b"x" * (1024 * 128 + 1)  # > 2 chunks
        f = tmp_path / "large.bin"
        f.write_bytes(content)
        assert hr.sha256_file(f) == hashlib.sha256(content).hexdigest()


# ---------------------------------------------------------------------------
# Manifest I/O
# ---------------------------------------------------------------------------


class TestLoadManifest:
    def test_loads_valid_json(self, hr, tmp_path):
        data = {"version": "1.0.0", "platforms": {}}
        f = tmp_path / "version.json"
        f.write_text(json.dumps(data))
        assert hr.load_manifest(f) == data

    def test_file_not_found_exits(self, hr, tmp_path):
        missing = tmp_path / "nonexistent.json"
        with pytest.raises(SystemExit):
            hr.load_manifest(missing)

    def test_invalid_json_exits(self, hr, tmp_path):
        f = tmp_path / "bad.json"
        f.write_text("not json")
        with pytest.raises(SystemExit):
            hr.load_manifest(f)


class TestSaveManifest:
    def test_writes_pretty_json(self, hr, tmp_path):
        data = {"version": "1.0.0", "platforms": {}}
        dest = tmp_path / "out.json"
        hr.save_manifest(dest, data)
        assert dest.read_text().strip().endswith("}")
        # Verify it's valid JSON
        loaded = json.loads(dest.read_text())
        assert loaded == data


# ---------------------------------------------------------------------------
# update_checksum
# ---------------------------------------------------------------------------


class TestUpdateChecksum:
    def test_updates_manifest(self, hr, tmp_path):
        manifest = {
            "version": "1.0.0",
            "platforms": {
                "windows": {
                    "download_url": "https://u/file.exe",
                    "checksum_sha256": "",
                    "minimum_version": "1.0.0",
                }
            },
        }
        artifact = tmp_path / "app.exe"
        artifact.write_bytes(b"binary content")

        hex_digest, key = hr.update_checksum(manifest, "windows", artifact)

        assert key == "windows"
        assert hex_digest == hashlib.sha256(b"binary content").hexdigest()
        assert manifest["platforms"]["windows"]["checksum_sha256"] == hex_digest

    def test_dry_run_skips_update(self, hr, tmp_path):
        manifest = {
            "version": "1.0.0",
            "platforms": {
                "android": {
                    "download_url": "https://u/app.apk",
                    "checksum_sha256": "",
                    "minimum_version": "1.0.0",
                }
            },
        }
        artifact = tmp_path / "app.apk"
        artifact.write_bytes(b"apk data")

        hex_digest, key = hr.update_checksum(manifest, "android", artifact, dry_run=True)

        assert manifest["platforms"]["android"]["checksum_sha256"] == ""  # unchanged
        assert hex_digest == hashlib.sha256(b"apk data").hexdigest()

    def test_missing_platform_exits(self, hr, tmp_path):
        """Missing platform key in non-dry-run → SystemExit."""
        manifest = {"version": "1.0.0", "platforms": {}}
        artifact = tmp_path / "x.bin"
        artifact.write_bytes(b"data")

        with pytest.raises(SystemExit):
            hr.update_checksum(manifest, "windows", artifact)

    def test_dry_run_skips_platform_check(self, hr, tmp_path):
        """Dry-run should NOT validate platform existence."""
        manifest = {"version": "1.0.0", "platforms": {}}  # empty platforms
        artifact = tmp_path / "x.bin"
        artifact.write_bytes(b"data")

        # Should not raise
        hex_digest, key = hr.update_checksum(manifest, "windows", artifact, dry_run=True)
        assert hex_digest == hashlib.sha256(b"data").hexdigest()


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


class TestFormatSize:
    def test_bytes(self, hr):
        assert "500.0 B" in hr._format_size(500)

    def test_kilobytes(self, hr):
        assert "1.5 KB" in hr._format_size(1536)

    def test_megabytes(self, hr):
        assert "2.0 MB" in hr._format_size(2 * 1024 * 1024)

    def test_gigabytes(self, hr):
        assert "1.0 GB" in hr._format_size(1024**3)


class TestPrintHash:
    def test_prints_expected_format(self, hr, tmp_path, capsys):
        f = tmp_path / "setup.exe"
        f.write_bytes(b"x" * 512)
        hr.print_hash(f, "windows", "a" * 64)

        captured = capsys.readouterr()
        assert "windows" in captured.out
        assert "a" * 64 in captured.out
        assert "setup.exe" in captured.out


class TestPrintSummary:
    def test_empty_no_output(self, hr, capsys):
        hr.print_summary([])
        captured = capsys.readouterr()
        assert captured.out == ""

    def test_with_results(self, hr, tmp_path, capsys):
        f = tmp_path / "app.exe"
        f.write_bytes(b"data")
        hr.print_summary([("windows", "abc", f)])
        captured = capsys.readouterr()
        assert "SHA-256" in captured.out
        assert "windows" in captured.out
        assert "abc" in captured.out


# ---------------------------------------------------------------------------
# CLI — main()
# ---------------------------------------------------------------------------


class TestMain:
    def test_print_mode(self, hr, tmp_path, capsys):
        """--print computes and displays hash without reading or writing version.json."""
        artifact = tmp_path / "test.exe"
        artifact.write_bytes(b"test data")

        hr.main(["--file", str(artifact), "--platform", "windows", "--print"])

        captured = capsys.readouterr()
        assert "windows" in captured.out
        assert hr.sha256_file(artifact) in captured.out
        assert "dry run" in captured.out

    def test_update_manifest(self, hr, tmp_path):
        """Update the checksum in version.json."""
        manifest = tmp_path / "version.json"
        manifest.write_text(
            json.dumps(
                {
                    "version": "1.0.0",
                    "platforms": {
                        "windows": {
                            "download_url": "https://u/file.exe",
                            "checksum_sha256": "",
                            "minimum_version": "1.0.0",
                        }
                    },
                }
            )
        )
        artifact = tmp_path / "setup.exe"
        artifact.write_bytes(b"installer data")

        hr.main(
            [
                "--manifest",
                str(manifest),
                "--windows",
                str(artifact),
            ]
        )

        # Reload manifest and check the checksum was filled in
        with open(manifest) as f:
            data = json.load(f)
        expected = hr.sha256_file(artifact)
        assert data["platforms"]["windows"]["checksum_sha256"] == expected

    def test_update_android_and_windows(self, hr, tmp_path):
        """Update both platforms in one call."""
        manifest = tmp_path / "version.json"
        manifest.write_text(
            json.dumps(
                {
                    "version": "1.0.0",
                    "platforms": {
                        "windows": {
                            "download_url": "https://u/file.exe",
                            "checksum_sha256": "",
                            "minimum_version": "1.0.0",
                        },
                        "android": {
                            "download_url": "https://u/app.apk",
                            "checksum_sha256": "",
                            "minimum_version": "1.0.0",
                        },
                    },
                }
            )
        )
        exe = tmp_path / "setup.exe"
        exe.write_bytes(b"exe")
        apk = tmp_path / "app.apk"
        apk.write_bytes(b"apk")

        hr.main(
            [
                "--manifest",
                str(manifest),
                "--windows",
                str(exe),
                "--android",
                str(apk),
            ]
        )

        with open(manifest) as f:
            data = json.load(f)
        assert data["platforms"]["windows"]["checksum_sha256"] == hr.sha256_file(exe)
        assert data["platforms"]["android"]["checksum_sha256"] == hr.sha256_file(apk)

    def test_check_pass(self, hr, tmp_path, capsys):
        """--check exits with code 0 when hash matches."""
        artifact = tmp_path / "app.exe"
        artifact.write_bytes(b"data")
        h = hr.sha256_file(artifact)

        manifest = tmp_path / "version.json"
        manifest.write_text(
            json.dumps(
                {
                    "version": "1.0.0",
                    "platforms": {
                        "windows": {
                            "download_url": "https://u/file.exe",
                            "checksum_sha256": h,
                            "minimum_version": "1.0.0",
                        }
                    },
                }
            )
        )

        # Should not raise SystemExit
        hr.main(
            [
                "--manifest",
                str(manifest),
                "--check",
                str(artifact),
                "--check-platform",
                "windows",
            ]
        )
        captured = capsys.readouterr()
        assert "hash matches" in captured.out

    def test_check_fail(self, hr, tmp_path):
        """--check exits with code 1 when hash mismatches."""
        artifact = tmp_path / "app.exe"
        artifact.write_bytes(b"data")

        manifest = tmp_path / "version.json"
        manifest.write_text(
            json.dumps(
                {
                    "version": "1.0.0",
                    "platforms": {
                        "windows": {
                            "download_url": "https://u/file.exe",
                            "checksum_sha256": "f" * 64,
                            "minimum_version": "1.0.0",
                        }
                    },
                }
            )
        )

        with pytest.raises(SystemExit):
            hr.main(
                [
                    "--manifest",
                    str(manifest),
                    "--check",
                    str(artifact),
                    "--check-platform",
                    "windows",
                ]
            )

    def test_missing_file_exits(self, hr, tmp_path):
        """Non-existent artifact exits with error."""
        manifest = tmp_path / "version.json"
        manifest.write_text(
            json.dumps({"version": "1.0.0", "platforms": {"windows": {"download_url": "", "checksum_sha256": "", "minimum_version": ""}}})
        )

        with pytest.raises(SystemExit):
            hr.main(["--manifest", str(manifest), "--windows", str(tmp_path / "nope.exe")])

    def test_no_files_errors(self, hr):
        """No files specified → parser error (SystemExit)."""
        with pytest.raises(SystemExit):
            hr.main([])

    def test_file_without_platform_errors(self, hr):
        """--file without --platform → parser error."""
        with pytest.raises(SystemExit):
            hr.main(["--file", "some.exe"])
