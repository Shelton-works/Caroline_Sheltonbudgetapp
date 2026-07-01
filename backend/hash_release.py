"""
hash_release.py — SHA-256 Checksum Helper for version.json
===========================================================

Computes SHA-256 hashes for release artifacts (installers, APKs) and
updates the corresponding ``checksum_sha256`` fields in ``version.json``.

Usage (interactive):
    python backend/hash_release.py --windows dist/app-setup.exe --android dist/app-release.apk

Usage (CI / one-off):
    python backend/hash_release.py --file dist/app-setup.exe --platform windows
    python backend/hash_release.py --manifest version.json --windows dist/setup.exe --android dist/app.apk

Print-only (no file write):
    python backend/hash_release.py --file dist/app.exe --print
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------


def sha256_file(path: Path) -> str:
    """Compute the SHA-256 hex digest of a file in one pass.

    Reads the file in 64 KB chunks to handle large installers/APKs
    without loading the entire file into memory.
    """
    sha = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(64 * 1024)
            if not chunk:
                break
            sha.update(chunk)
    return sha.hexdigest()


# ---------------------------------------------------------------------------
# Manifest I/O
# ---------------------------------------------------------------------------


def load_manifest(path: Path) -> dict[str, Any]:
    """Load and return the version.json manifest as a Python dict."""
    if not path.is_file():
        print(f"Error: manifest not found at {path}", file=sys.stderr)
        sys.exit(1)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as exc:
        print(f"Error: invalid JSON in {path}: {exc}", file=sys.stderr)
        sys.exit(1)


def save_manifest(path: Path, data: dict[str, Any]) -> None:
    """Write the manifest dict back to disk as pretty-printed JSON."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")  # trailing newline
    print(f"OK Updated {path}")


def update_checksum(
    manifest: dict[str, Any],
    platform_key: str,
    file_path: Path,
    *,
    dry_run: bool = False,
) -> tuple[str, str]:
    """Compute the hash and update the manifest's checksum_sha256 field.

    Args:
        manifest:     The parsed version.json dict (mutated in place).
        platform_key: ``"windows"`` or ``"android"``.
        file_path:    Path to the release artifact.
        dry_run:      If True, compute the hash without modifying ``manifest``.

    Returns:
        ``(hex_digest, platform_key)``.

    Raises:
        SystemExit: If *platform_key* is missing from *manifest* (only when
                     not in dry_run mode).
    """
    if not dry_run:
        if platform_key not in manifest.get("platforms", {}):
            print(
                f"Error: platform '{platform_key}' not found in manifest. "
                f"Available: {list(manifest.get('platforms', {}).keys())}",
                file=sys.stderr,
            )
            sys.exit(1)

    hex_digest = sha256_file(file_path)

    if not dry_run:
        manifest["platforms"][platform_key]["checksum_sha256"] = hex_digest

    return hex_digest, platform_key


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def print_hash(file_path: Path, platform_key: str, hex_digest: str) -> None:
    """Print a single hash result to stdout."""
    size = file_path.stat().st_size
    size_str = _format_size(size)
    print(
        f"  {platform_key:>8s}  {hex_digest}  "
        f"{file_path.name}  ({size_str})"
    )


def print_summary(results: list[tuple[str, str, Path]]) -> None:
    """Print a summary table of all hashes."""
    if not results:
        return
    print("\n--- SHA-256 Checksums ---")
    for platform_key, hex_digest, file_path in results:
        print_hash(file_path, platform_key, hex_digest)
    print("-------------------------")


def _format_size(bytes_: int) -> str:
    """Human-readable file size."""
    for unit in ("B", "KB", "MB", "GB"):
        if bytes_ < 1024:
            return f"{bytes_:.1f} {unit}"
        bytes_ /= 1024
    return f"{bytes_:.1f} TB"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Compute SHA-256 checksums for release artifacts and update version.json.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  %(prog)s --windows dist/app-setup.exe --android dist/app-release.apk\n"
            "  %(prog)s --file dist/app.exe --platform windows\n"
            "  %(prog)s --manifest path/to/version.json --windows dist/app.exe\n"
            "  %(prog)s --file dist/app.exe --print\n"
        ),
    )
    parser.add_argument(
        "--manifest",
        default="version.json",
        help="Path to version.json (default: ./version.json)",
    )
    parser.add_argument(
        "--windows",
        metavar="FILE",
        default=None,
        help="Path to the Windows installer (.exe)",
    )
    parser.add_argument(
        "--android",
        metavar="FILE",
        default=None,
        help="Path to the Android APK",
    )
    parser.add_argument(
        "--file",
        metavar="FILE",
        default=None,
        help="Single file to hash (use with --platform)",
    )
    parser.add_argument(
        "--platform",
        default=None,
        choices=["windows", "android"],
        help="Platform key when using --file (required with --file)",
    )
    parser.add_argument(
        "--print",
        action="store_true",
        default=False,
        help="Print hashes to stdout without modifying version.json",
    )
    parser.add_argument(
        "--check",
        help="Check that the hash of FILE matches the value in version.json",
        metavar="FILE",
    )
    parser.add_argument(
        "--check-platform",
        default=None,
        choices=["windows", "android"],
        help="Platform to check when using --check",
    )
    return parser


def main(argv: list[str] | None = None) -> None:
    parser = _build_parser()
    args = parser.parse_args(argv)

    # --- --check mode (validate hash against manifest, no file args needed) --
    if args.check:
        manifest_path = Path(args.manifest)
        manifest = load_manifest(manifest_path)
        check_platform = args.check_platform
        if not check_platform:
            parser.error("--check-platform is required when using --check")
        check_file = Path(args.check)

        if not check_file.is_file():
            print(f"Error: file not found: {check_file}", file=sys.stderr)
            sys.exit(1)

        expected = (
            manifest.get("platforms", {})
            .get(check_platform, {})
            .get("checksum_sha256", "")
        )
        if not expected:
            print(
                f"Error: no checksum_sha256 for platform '{check_platform}' "
                f"in {manifest_path}",
                file=sys.stderr,
            )
            sys.exit(1)

        actual = sha256_file(check_file)
        if actual == expected:
            print(f"OK {check_platform}: hash matches ({actual[:16]}...{actual[-16:]})")
        else:
            print(f"FAIL {check_platform}: hash MISMATCH", file=sys.stderr)
            print(f"  Expected: {expected}", file=sys.stderr)
            print(f"  Actual:   {actual}", file=sys.stderr)
            sys.exit(1)
        return

    # --- Resolve files to hash ---
    file_map: list[tuple[str, Path]] = []  # (platform_key, Path)

    if args.file:
        if not args.platform:
            parser.error("--platform is required when using --file")
        file_map.append((args.platform, Path(args.file)))
    else:
        if args.windows:
            file_map.append(("windows", Path(args.windows)))
        if args.android:
            file_map.append(("android", Path(args.android)))
        if not file_map:
            parser.error(
                "No files specified. Use --windows, --android, or --file."
            )

    # --- Validate files exist ---
    for platform_key, file_path in file_map:
        if not file_path.is_file():
            print(
                f"Error: file not found for '{platform_key}': {file_path}",
                file=sys.stderr,
            )
            sys.exit(1)

    # --- Hash mode ---
    manifest_path = Path(args.manifest)
    manifest = load_manifest(manifest_path) if not args.print else {}
    results: list[tuple[str, str, Path]] = []

    for platform_key, file_path in file_map:
        hex_digest, _ = update_checksum(
            manifest,
            platform_key,
            file_path,
            dry_run=args.print,
        )
        results.append((platform_key, hex_digest, file_path))

    # --- Summary ---
    print_summary(results)

    if not args.print:
        save_manifest(manifest_path, manifest)
        print("Done. Upload version.json alongside your release artifacts on GitHub Releases.")
    else:
        print("(dry run -- no files modified)")


if __name__ == "__main__":
    main()
