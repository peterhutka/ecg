#!/usr/bin/env python3
from __future__ import annotations

import shutil
import time
import urllib.request
import zipfile
import subprocess
import threading
import ssl
from pathlib import Path

try:
    import certifi
except ImportError:  # pragma: no cover - fallback only when certifi is absent.
    certifi = None


DATASETS = (
    {
        "slug": "nsrdb",
        "version": "1.0.0",
    },
    {
        "slug": "mitdb",
        "version": "1.0.0",
    },
    {
        "slug": "afdb",
        "version": "1.0.0",
    },
    {
        "slug": "challenge-2017",
        "version": "1.0.0",
        "archives": (
            {
                "name": "training2017.zip",
                "url": "https://physionet.org/files/challenge-2017/1.0.0/training2017.zip?download",
                "extract_dir": "training2017",
            },
        ),
    },
)


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def shared_data_root() -> Path:
    return repo_root() / "shared-data"


def normalized_name(slug: str, version: str) -> str:
    return f"{slug}_{version}_"


def zip_url(slug: str, version: str) -> str:
    return f"https://physionet.org/content/{slug}/get-zip/{version}/"


def archive_name(slug: str, version: str) -> str:
    return f"{slug}_{version}.zip"


def part_name(slug: str, version: str) -> str:
    return f"{archive_name(slug, version)}.part"


def default_archive_spec(slug: str, version: str) -> dict[str, str]:
    archive = archive_name(slug, version)
    return {
        "name": archive,
        "url": zip_url(slug, version),
        "extract_dir": "",
    }


def complete_marker(target_dir: Path) -> Path:
    return target_dir / ".complete"


def format_bytes(num_bytes: int) -> str:
    units = ("B", "KB", "MB", "GB", "TB", "PB")
    value = float(num_bytes)
    for unit in units:
        if value < 1024.0 or unit == units[-1]:
            if unit == "B":
                return f"{int(value)} {unit}"
            return f"{value:.2f} {unit}"
        value /= 1024.0


def format_duration(seconds: float) -> str:
    if seconds < 0:
        seconds = 0

    total = int(round(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)

    if hours:
        return f"{hours}h {minutes:02d}m {secs:02d}s"
    if minutes:
        return f"{minutes}m {secs:02d}s"
    return f"{secs}s"


def clear_line(text: str) -> str:
    return f"\r\033[K{text}"


def download_ssl_context() -> ssl.SSLContext:
    if certifi is not None:
        return ssl.create_default_context(cafile=certifi.where())
    return ssl.create_default_context()


class DownloadProgress:
    def __init__(
        self,
        filename: str,
        total_bytes: int | None,
        *,
        starting_bytes: int = 0,
    ) -> None:
        self.filename = filename
        self.total_bytes = total_bytes
        self.starting_bytes = starting_bytes
        self.downloaded = starting_bytes
        self.started_at = time.monotonic()
        self.last_update_at = self.started_at
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._thread = threading.Thread(target=self._heartbeat, daemon=True)

    def start(self) -> None:
        self._thread.start()

    def update(self, downloaded: int) -> None:
        with self._lock:
            self.downloaded = downloaded
            self.last_update_at = time.monotonic()
            self._render()

    def finish(self) -> None:
        self._stop.set()
        self._thread.join(timeout=1)
        with self._lock:
            self._render(final=True)
            print()

    def _heartbeat(self) -> None:
        while not self._stop.wait(10):
            with self._lock:
                if self._stop.is_set():
                    return
                idle_for = time.monotonic() - self.last_update_at
                if idle_for >= 10:
                    self._render(idle_for=idle_for)

    def _render(self, final: bool = False, idle_for: float | None = None) -> None:
        elapsed = max(time.monotonic() - self.started_at, 1e-9)
        downloaded = self.downloaded

        if self.total_bytes:
            percent = downloaded * 100 / self.total_bytes
            session_downloaded = max(downloaded - self.starting_bytes, 0)
            rate = session_downloaded / elapsed if session_downloaded else 0
            remaining = max(self.total_bytes - downloaded, 0)
            eta = remaining / rate if rate > 0 else 0
            pieces = [
                self.filename,
                f"{percent:5.1f}%",
                f"{format_bytes(downloaded)} / {format_bytes(self.total_bytes)}",
                f"eta {format_duration(eta)}",
            ]
        else:
            pieces = [
                self.filename,
                f"{format_bytes(downloaded)} downloaded",
            ]

        if idle_for is not None:
            pieces.append(f"idle {format_duration(idle_for)}")
        if final:
            pieces.append("done")

        print(clear_line("  " + "  ".join(pieces)), end="", flush=True)


def parse_total_bytes(response: urllib.response.addinfourl, downloaded: int) -> int | None:
    content_range = response.headers.get("Content-Range")
    if content_range:
        try:
            _, range_spec = content_range.split(" ", 1)
            _, total_text = range_spec.split("/", 1)
            if total_text != "*":
                return int(total_text)
        except ValueError:
            pass

    content_length = response.headers.get("Content-Length")
    if content_length and content_length.isdigit():
        return downloaded + int(content_length)

    return None


def download_zip(url: str, destination: Path, *, resume_from: int = 0) -> None:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    if resume_from:
        request.add_header("Range", f"bytes={resume_from}-")
        mode = "ab"
        print(f"  resuming {destination.name} from {format_bytes(resume_from)}")
    else:
        mode = "wb"
        print(f"  downloading to {destination.name}")

    context = download_ssl_context()

    with urllib.request.urlopen(request, context=context) as response:
        status = getattr(response, "status", None)
        if resume_from and status != 206:
            print("  server did not resume; restarting from byte 0")
            return download_zip(url, destination, resume_from=0)

        downloaded = resume_from
        total_bytes = parse_total_bytes(response, downloaded)
        chunk_size = 1024 * 1024
        progress = DownloadProgress(
            destination.name,
            total_bytes,
            starting_bytes=resume_from,
        )
        progress.start()

        with destination.open(mode) as out:
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                out.write(chunk)
                downloaded += len(chunk)
                progress.update(downloaded)

        progress.finish()


class KeepAwake:
    def __init__(self) -> None:
        self._process: subprocess.Popen[str] | None = None

    def __enter__(self) -> "KeepAwake":
        caffeinate = shutil.which("caffeinate")
        if caffeinate is not None:
            print("Keeping the system awake during dataset seeding...")
            self._process = subprocess.Popen([caffeinate, "-dimsu"])
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._process is not None and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()


def extract_zip(archive: Path, target_dir: Path) -> None:
    with zipfile.ZipFile(archive) as zf:
        print(f"  extracting {len(zf.infolist()):,} files into {target_dir.name}")
        zf.extractall(target_dir)
        print(f"  extraction complete for {archive.name}")


def seed_archive(target_dir: Path, archive_spec: dict[str, str]) -> None:
    archive_name_value = archive_spec["name"]
    archive_url = archive_spec["url"]
    extract_dir_name = archive_spec.get("extract_dir", "")
    archive = target_dir / archive_name_value
    part = target_dir / f"{archive_name_value}.part"

    print(f"  stage: download {archive_name_value}")
    if part.exists():
        resume_from = part.stat().st_size
        download_zip(archive_url, part, resume_from=resume_from)
    else:
        download_zip(archive_url, part)

    if archive.exists():
        archive.unlink()
    part.rename(archive)

    print(f"  stage: extract {archive_name_value}")
    extract_root = target_dir if not extract_dir_name else target_dir / extract_dir_name
    extract_root.mkdir(parents=True, exist_ok=True)
    extract_zip(archive, extract_root)
    archive.unlink(missing_ok=True)


def seed_dataset(root: Path, dataset: dict[str, object]) -> None:
    slug = str(dataset["slug"])
    version = str(dataset["version"])
    target_dir = root / normalized_name(slug, version)
    marker = complete_marker(target_dir)
    if marker.exists():
        print(f"\n[{slug}] skipping {target_dir.name} (complete)")
        return

    target_dir.mkdir(parents=True, exist_ok=True)

    archive_specs = dataset.get("archives")
    if not archive_specs:
        archive_specs = (default_archive_spec(slug, version),)

    try:
        print(f"\n[{slug}] fetching {len(archive_specs)} archive(s)")
        for archive_spec in archive_specs:
            seed_archive(target_dir, archive_spec)
        marker.write_text("complete\n", encoding="utf-8")
        print(f"  wrote marker: {marker.name}")
        print(f"  done: {target_dir}")
    except Exception:
        print(f"  leaving partial state in {target_dir} for resume")
        raise


def main() -> int:
    root = shared_data_root()
    root.mkdir(parents=True, exist_ok=True)

    print(f"Seeding datasets into {root}")
    with KeepAwake():
        for dataset in DATASETS:
            seed_dataset(root, dataset)
    print("All datasets seeded")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
