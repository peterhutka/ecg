import os
from urllib.parse import unquote
from pathlib import Path

from typing import Literal, Optional
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.routing import APIRoute

class File(BaseModel):
    path: str
    type: Literal["dir", "file"]


class FileContent(BaseModel):
    path: str
    extension: str
    size: int
    supported: bool
    content: Optional[str] = None


class AnnotationContent(BaseModel):
    path: str
    content: Optional[str] = None


app = FastAPI(title="ECG Backend")



app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def shared_data_root() -> Path:
    configured = os.environ.get("SHARED_DATA_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[2] / "shared-data"


def shared_data_ignore_file() -> Path:
    return shared_data_root() / ".ecg-ignore"


def ignored_relative_paths() -> list[Path]:
    ignore_file = shared_data_ignore_file()
    if not ignore_file.is_file():
        return []

    ignored: list[Path] = []
    for line in ignore_file.read_text(errors="replace").splitlines():
        entry = line.strip()
        if not entry or entry.startswith("#"):
            continue
        ignored.append(Path(entry))
    return ignored


def is_ignored_path(relative_path: Path) -> bool:
    ignored_paths = ignored_relative_paths()
    if not ignored_paths:
        return False

    normalized = relative_path.as_posix().lstrip("./")
    for ignored in ignored_paths:
        ignored_str = ignored.as_posix().lstrip("./")
        if normalized == ignored_str or normalized.startswith(f"{ignored_str}/"):
            return True
    return False


def resolve_shared_path(relative_path: str) -> Path:
    shared_data = shared_data_root()
    relative = Path(unquote(relative_path))
    resolved = (shared_data / relative).resolve()
    if shared_data not in resolved.parents and resolved != shared_data:
        raise HTTPException(status_code=400, detail="Invalid file path")
    try:
        relative_resolved = resolved.relative_to(shared_data)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file path")
    if is_ignored_path(relative_resolved):
        raise HTTPException(status_code=404, detail="File not found")
    if not resolved.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return resolved

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/files")
def files():
    shared_data = shared_data_root()
    print(f"Shared data root: {shared_data}")
    files = []
    for path in shared_data.rglob("*"):
        relative = path.relative_to(shared_data)
        if relative == Path(".ecg-ignore"):
            continue
        if is_ignored_path(relative):
            continue
        if path.is_dir():
            files.append(File(path=relative.as_posix(), type="dir"))
        elif path.is_file():
            files.append(File(path=relative.as_posix(), type="file"))

    return {"status": "ok", "files": files}


@app.get("/file")
def file(path: str):
    resolved = resolve_shared_path(path)
    extension = resolved.suffix.lstrip(".").lower()
    size = resolved.stat().st_size
    if extension == "dat":
        return FileContent(path=path, extension=extension, size=size, supported=True)
    if extension not in {"txt", "htm", "html"}:
        return FileContent(path=path, extension=extension, size=size, supported=False)
    return FileContent(
        path=path,
        extension=extension,
        size=size,
        supported=True,
        content=resolved.read_text(errors="replace"),
    )


@app.get("/file/raw")
def file_raw(path: str):
    resolved = resolve_shared_path(path)
    return FileResponse(
        path=str(resolved),
        media_type="application/octet-stream",
        filename=resolved.name,
    )


@app.get("/file/annotations")
def file_annotations(path: str):
    resolved = resolve_shared_path(path)
    index = resolved.name.rfind(".")
    annotation_name = f"{resolved.name[:index]}.atr" if index > 0 else f"{resolved.name}.atr"
    annotation_path = resolved.with_name(annotation_name)

    if not annotation_path.is_file():
        return AnnotationContent(path=str(annotation_path.relative_to(shared_data_root())), content=None)

    return AnnotationContent(
        path=str(annotation_path.relative_to(shared_data_root())),
        content=annotation_path.read_text(errors="replace"),
    )

for route in app.routes:
    if isinstance(route, APIRoute):
        print(route.path)
        print("endpoint:", route.endpoint.__name__)
        print("direct dependencies:",
              [d.call.__name__ for d in route.dependant.dependencies])
