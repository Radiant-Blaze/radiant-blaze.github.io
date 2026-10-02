import argparse
import json
from collections import Counter
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen

from compare_output import start_server


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"


def normalize_line_endings(value):
    return value.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def request_bytes(base_url, route):
    url = f"{base_url}/{quote(route.lstrip('/'), safe='/')}"
    try:
        with urlopen(url) as response:
            return response.status, response.read()
    except HTTPError as error:
        return error.code, error.read()
    except URLError:
        return 0, b""


def compare_json(legacy, astro, path="$", differences=None):
    if differences is None:
        differences = {
            "types": [],
            "ordering": [],
            "missing_fields": [],
            "extra_fields": [],
            "values": [],
        }

    if type(legacy) is not type(astro):
        differences["types"].append(
            {"path": path, "legacy": type(legacy).__name__, "astro": type(astro).__name__}
        )
        return differences

    if isinstance(legacy, dict):
        legacy_keys = list(legacy)
        astro_keys = list(astro)
        if legacy_keys != astro_keys:
            differences["ordering"].append(
                {"path": path, "legacy_fields": legacy_keys, "astro_fields": astro_keys}
            )
        for key in legacy_keys:
            if key not in astro:
                differences["missing_fields"].append({"path": f"{path}.{key}"})
            else:
                compare_json(legacy[key], astro[key], f"{path}.{key}", differences)
        for key in astro_keys:
            if key not in legacy:
                differences["extra_fields"].append({"path": f"{path}.{key}"})
        return differences

    if isinstance(legacy, list):
        if legacy != astro and len(legacy) == len(astro):
            legacy_items = Counter(json.dumps(item, sort_keys=True) for item in legacy)
            astro_items = Counter(json.dumps(item, sort_keys=True) for item in astro)
            if legacy_items == astro_items:
                differences["ordering"].append(
                    {"path": path, "legacy_order": legacy, "astro_order": astro}
                )
                return differences
        if len(legacy) != len(astro):
            differences["values"].append(
                {"path": path, "legacy_length": len(legacy), "astro_length": len(astro)}
            )
        for index, legacy_item in enumerate(legacy[: len(astro)]):
            compare_json(legacy_item, astro[index], f"{path}[{index}]", differences)
        return differences

    if legacy != astro:
        differences["values"].append({"path": path, "legacy": legacy, "astro": astro})
    return differences


def first_byte_difference(legacy, astro):
    for index, (legacy_byte, astro_byte) in enumerate(zip(legacy, astro)):
        if legacy_byte != astro_byte:
            return index
    return min(len(legacy), len(astro)) if len(legacy) != len(astro) else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--astro-url",
        help="Compare against an already-running Astro preview instead of serving dist directly.",
    )
    args = parser.parse_args()
    ctf_index = json.loads((ROOT / "content/ctfs/index.json").read_text(encoding="utf-8"))
    urls = ["/content/posts/index.json", "/content/ctfs/index.json"]
    urls.extend(f"/content/ctfs/{ctf_id}/ctf.json" for ctf_id in ctf_index["ctfs"])
    legacy_server, legacy_url = start_server(ROOT)
    if args.astro_url:
        astro_server = None
        astro_url = args.astro_url.rstrip("/")
    else:
        astro_server, astro_url = start_server(DIST)
    reports = []

    try:
        for url in urls:
            legacy_status, legacy_body = request_bytes(legacy_url, url)
            astro_status, astro_body = request_bytes(astro_url, url)
            report = {
                "url": url,
                "http_status": {"legacy": legacy_status, "astro": astro_status},
                "bytes": {
                    "legacy": len(legacy_body),
                    "astro": len(astro_body),
                    "equal": legacy_body == astro_body,
                    "equal_after_line_endings": normalize_line_endings(legacy_body)
                    == normalize_line_endings(astro_body),
                    "first_difference": first_byte_difference(legacy_body, astro_body),
                },
            }

            if legacy_status == 200 and astro_status == 200:
                legacy_json = json.loads(legacy_body.decode("utf-8"))
                astro_json = json.loads(astro_body.decode("utf-8"))
                differences = compare_json(legacy_json, astro_json)
                report["json_differences"] = differences
                report["structurally_equal"] = not any(differences.values())
            else:
                report["json_differences"] = None
                report["structurally_equal"] = False
            reports.append(report)
    finally:
        legacy_server.shutdown()
        legacy_server.server_close()
        if astro_server:
            astro_server.shutdown()
            astro_server.server_close()

    failures = [
        report
        for report in reports
        if report["http_status"] != {"legacy": 200, "astro": 200}
        or not report["bytes"]["equal_after_line_endings"]
        or not report["structurally_equal"]
    ]
    print(
        json.dumps(
            {
                "response_count": len(reports),
                "astro_source": args.astro_url or "dist static file server",
                "matching_responses": len(reports) - len(failures),
                "failure_count": len(failures),
                "responses": reports,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
