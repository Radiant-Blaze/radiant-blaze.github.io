import argparse
import difflib
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen

from compare_output import start_server


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"


def request_bytes(base_url, route):
    url = f"{base_url}/{quote(route.lstrip('/'), safe='/')}"
    try:
        with urlopen(url) as response:
            return response.status, response.read(), url
    except HTTPError as error:
        return error.code, error.read(), url
    except URLError:
        return 0, b"", url


def line_ending_counts(value):
    without_crlf = value.replace(b"\r\n", b"")
    return {
        "crlf": value.count(b"\r\n"),
        "lf": without_crlf.count(b"\n"),
        "cr": without_crlf.count(b"\r"),
    }


def normalized_line_endings(value):
    return value.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def content_diff(legacy, astro):
    legacy_text = legacy.decode("utf-8", errors="replace").splitlines()
    astro_text = astro.decode("utf-8", errors="replace").splitlines()
    diff = list(
        difflib.unified_diff(
            legacy_text,
            astro_text,
            fromfile="legacy source",
            tofile="Astro response",
            lineterm="",
        )
    )
    return {
        "missing_from_astro": [line[1:] for line in diff if line.startswith("-") and not line.startswith("---")],
        "extra_in_astro": [line[1:] for line in diff if line.startswith("+") and not line.startswith("+++")],
        "unified_diff": diff[:80],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--astro-url",
        help="Compare against an already-running Astro preview instead of serving dist directly.",
    )
    args = parser.parse_args()

    paths = [
        *(
            ("posts/" + file.relative_to(ROOT / "content/posts").as_posix())
            for file in sorted((ROOT / "content/posts").rglob("*.md"))
        ),
        *(
            ("ctfs/" + file.relative_to(ROOT / "content/ctfs").as_posix())
            for file in sorted((ROOT / "content/ctfs").rglob("*.md"))
        ),
    ]
    legacy_server, legacy_url = start_server(ROOT)
    if args.astro_url:
        astro_server = None
        astro_url = args.astro_url.rstrip("/")
    else:
        astro_server, astro_url = start_server(DIST)

    reports = []
    try:
        for source_path in paths:
            route = f"/content/{source_path}"
            legacy_status, legacy_body, legacy_request_url = request_bytes(legacy_url, route)
            astro_status, astro_body, astro_request_url = request_bytes(astro_url, route)
            byte_equal = legacy_body == astro_body
            normalized_equal = normalized_line_endings(legacy_body) == normalized_line_endings(astro_body)
            reports.append(
                {
                    "source_path": source_path,
                    "legacy_url": legacy_request_url,
                    "astro_url": astro_request_url,
                    "url_path_match": legacy_request_url.split("?", 1)[0].removeprefix(legacy_url)
                    == astro_request_url.split("?", 1)[0].removeprefix(astro_url),
                    "http_status": {"legacy": legacy_status, "astro": astro_status},
                    "bytes": {
                        "legacy": len(legacy_body),
                        "astro": len(astro_body),
                        "equal": byte_equal,
                        "equal_after_line_endings": normalized_equal,
                        "legacy_line_endings": line_ending_counts(legacy_body),
                        "astro_line_endings": line_ending_counts(astro_body),
                    },
                    "content_difference": None if byte_equal else content_diff(legacy_body, astro_body),
                }
            )
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
        or not report["url_path_match"]
        or not report["bytes"]["equal"]
    ]
    print(
        json.dumps(
            {
                "response_count": len(reports),
                "astro_source": args.astro_url or "dist static file server",
                "byte_identical_responses": len(reports) - len(failures),
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