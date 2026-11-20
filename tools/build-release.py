#!/usr/bin/env python3
"""Build the portable offline ZIP without changing the development sources."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent

def build(mathjax_root, output):
    mathjax_root = mathjax_root.resolve()
    required = ["local-mathjax.js", "4.1.3/tex-svg.js", "4.1.3/LICENSE",
                "4.1.3/fonts/mathjax-newcm-font/LICENSE"]
    for name in required:
        if not (mathjax_root / name).is_file():
            raise FileNotFoundError(f"Missing MathJax dependency: {mathjax_root / name}")
    files = {}
    for path in sorted((ROOT / "dist").iterdir()):
        if not path.is_file():
            continue
        content = path.read_text(encoding="utf-8")
        if path.name == "index.html":
            content = content.replace("file:///D:/MathJax/local-mathjax.js", "vendor/mathjax/local-mathjax.js")
        elif path.name == "math.js":
            content = content.replace("D:\\\\MathJax", "vendor/mathjax").replace("共享文件", "随包文件").replace("shared files", "bundled files")
        files[path.name] = content.encode("utf-8")
    for path in sorted(mathjax_root.rglob("*")):
        if path.is_file() and (path.relative_to(mathjax_root).parts[0] == "4.1.3" or path.name == "local-mathjax.js"):
            relative = path.relative_to(mathjax_root).as_posix()
            data = path.read_bytes()
            if relative == "local-mathjax.js":
                data = data.replace(b"D:\\\\MathJax", b"vendor/mathjax")
            files["vendor/mathjax/" + relative] = data
    files["THIRD_PARTY_NOTICES.md"] = (ROOT / "THIRD_PARTY_NOTICES.md").read_bytes()
    files["START_HERE.txt"] = (
        "Neural network sandbox / 神经网络沙盒\n\n"
        "解压整个文件夹，然后用 Chrome 或 Edge 打开 index.html。\n"
        "不要只复制 HTML，也不要在 ZIP 预览中直接打开。无需 Python、Node.js、服务器或联网。\n"
        "配置和结果可从界面导出；刷新页面会清除尚未导出的实验和 Reference。\n\n"
        "Extract the entire folder, then open index.html in Chrome or Edge.\n"
        "Do not open the HTML inside the ZIP preview or move it away from its companion files.\n"
        "No installation, server or internet connection is needed. Export results before closing.\n"
        "Source: https://github.com/LuckytoeUSTC/neural-network-sandbox\n"
    ).encode("utf-8")
    manifest = {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
    files["SHA256SUMS.json"] = json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8")
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in files.items():
            archive.writestr("neural-network-sandbox/" + name, data)
    with ZipFile(output) as archive:
        for name, digest in manifest.items():
            assert hashlib.sha256(archive.read("neural-network-sandbox/" + name)).hexdigest() == digest
    print(f"Built {output} ({output.stat().st_size:,} bytes; {len(files)} files)")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mathjax-root", type=Path, default=Path("D:/MathJax"))
    parser.add_argument("--output", type=Path, default=ROOT / "release/neural-network-sandbox-offline.zip")
    args = parser.parse_args()
    build(args.mathjax_root, args.output.resolve())
