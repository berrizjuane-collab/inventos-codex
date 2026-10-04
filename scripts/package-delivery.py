"""Package source, compiled application, documentation and evidence with SHA-256."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent.parent
files = [root / name for name in [
    ".gitignore", ".npmrc", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
    "index.html", "tsconfig.json", "vite.config.ts", "playwright.config.ts",
    "playwright.performance.config.ts", "SPEC.md", "DESIGN.md", "PLAN.md",
    "VALIDATION.md", "STATUS.md", "README.md",
]]
for directory in ["src", "tests", "scripts", "docs", "evidence", "dist"]:
    files.extend(path for path in (root / directory).rglob("*") if path.is_file() and "__pycache__" not in path.parts)
files = sorted(set(files))
entries = [{"path": str(path.relative_to(root)), "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in files]
manifest = {"application": "Laboratorio de campos vectoriales", "version": "1.0.0",
            "algorithm": "SHA-256", "files": entries,
            "verification": "Hashes cover all packaged files except this manifest itself. Checks and pending requirements are in STATUS.md."}
manifest_path = root / "DELIVERY-MANIFEST.json"
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
archive = root.parent / "entrega-campo-v1.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as package:
    for path in files + [manifest_path]:
        package.write(path, str(Path("campo-vectorial-v1") / path.relative_to(root)))
with zipfile.ZipFile(archive) as package:
    assert package.testzip() is None
    for entry in entries:
        data = package.read("campo-vectorial-v1/" + entry["path"])
        assert len(data) == entry["bytes"]
        assert hashlib.sha256(data).hexdigest() == entry["sha256"]
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(root.parent / "entrega-campo-v1.sha256").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
print(json.dumps({"archive": str(archive), "bytes": archive.stat().st_size,
                  "files": len(files) + 1, "sha256": digest, "verified": True}))
