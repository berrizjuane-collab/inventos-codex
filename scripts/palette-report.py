"""Check actual rendered RGB channels; requires Pillow, independently of the app."""
from pathlib import Path
from PIL import Image, ImageChops
import json

root = Path(__file__).resolve().parent.parent
paths = sorted((root / "evidence/captures").glob("final-*.png"))
paths += sorted((root / "evidence/exports").glob("*.png"))
native_report = root / "evidence/native-zoom.json"
if native_report.is_file():
    native = json.loads(native_report.read_text(encoding="utf-8"))
    if native.get("nativeZoomVerified") and native.get("passed"):
        paths.append(root / native["capture"])
paths = sorted(set(paths))
results = []
for path in paths:
    with Image.open(path) as image:
        red, green, blue = image.convert("RGB").split()
        difference = ImageChops.lighter(ImageChops.difference(red, green), ImageChops.difference(green, blue))
        nonneutral = sum(difference.histogram()[1:])
        results.append({"path": str(path.relative_to(root)), "width": image.width, "height": image.height,
                        "pixels": image.width * image.height, "nonneutralPixels": nonneutral})
report = {"method": "Every RGB pixel: R=G=B, including antialiased text, scene and PNG metadata.",
          "images": len(results), "pixels": sum(item["pixels"] for item in results),
          "nonneutralPixels": sum(item["nonneutralPixels"] for item in results), "results": results}
(root / "evidence/palette-final.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps({key: value for key, value in report.items() if key != "results"}))
if report["nonneutralPixels"]:
    raise SystemExit(1)
