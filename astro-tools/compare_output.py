import functools
import html
import json
import re
import threading
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
ASTRO_MANIFEST = DIST / "astro-article-order.json"
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
PRESERVE_TEXT_TAGS = {"pre", "code"}
INLINE_TEXT_TAGS = {"a", "b", "blockquote", "em", "h1", "h2", "h3", "h4", "h5", "h6", "i", "li", "p", "span", "strong", "sub", "sup"}


class Node:
    def __init__(self, tag="", attrs=None):
        self.tag = tag
        self.attrs = dict(attrs or [])
        self.children = []


class DocumentParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("document")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag, attrs))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def parse_document(source):
    parser = DocumentParser()
    parser.feed(source.replace("\r\n", "\n").replace("\r", "\n"))
    parser.close()
    return parser.root


def text_content(node):
    if isinstance(node, str):
        return node
    return "".join(text_content(child) for child in node.children)


def normalized_text(value):
    return re.sub(r"\s+", " ", value).strip()


def has_class(node, class_name):
    return class_name in node.attrs.get("class", "").split()


def find_first(node, predicate):
    if not isinstance(node, str) and predicate(node):
        return node
    if not isinstance(node, str):
        for child in node.children:
            found = find_first(child, predicate)
            if found:
                return found
    return None


def find_all(node, predicate):
    matches = []
    if not isinstance(node, str):
        if predicate(node):
            matches.append(node)
        for child in node.children:
            matches.extend(find_all(child, predicate))
    return matches


def node_signature(node, preserve=False):
    if isinstance(node, str):
        if not preserve and not node.strip():
            return None
        return ("text", node)

    preserve = preserve or node.tag in PRESERVE_TEXT_TAGS or node.tag in INLINE_TEXT_TAGS
    children = [node_signature(child, preserve) for child in node.children]
    children = [child for child in children if child is not None]
    attrs = tuple(sorted((key, value or "") for key, value in node.attrs.items()))
    return (node.tag, attrs, tuple(children))


def article_facts(source):
    root = parse_document(source)
    title_node = find_first(root, lambda node: node.tag == "title")
    canonical = find_first(root, lambda node: node.tag == "link" and node.attrs.get("rel") == "canonical")
    article = find_first(root, lambda node: node.tag == "article" and has_class(node, "quest-article"))
    related = find_first(root, lambda node: node.tag == "nav" and node.attrs.get("aria-label", "").startswith("Related"))
    back = find_first(root, lambda node: node.tag == "p" and has_class(node, "ctf-back"))
    sidebar = find_first(root, lambda node: node.tag == "aside" and has_class(node, "sidebar"))

    metadata = sorted(
        (
            tuple(sorted((key, value or "") for key, value in node.attrs.items()))
            for node in find_all(root, lambda node: node.tag == "meta")
        )
    )
    headings = [
        (node.tag, node.attrs.get("id", ""), text_content(node))
        for node in find_all(root, lambda node: re.fullmatch(r"h[1-6]", node.tag))
    ]
    code_blocks = [
        (node_signature(node), text_content(node))
        for node in find_all(root, lambda node: node.tag == "pre")
    ]
    math_blocks = [
        (node_signature(node), text_content(node))
        for node in find_all(root, lambda node: node.tag == "div" and has_class(node, "math-block"))
    ]
    links = [
        (
            node.attrs.get("href", ""),
            node.attrs.get("target", ""),
            text_content(node),
        )
        for node in find_all(root, lambda node: node.tag == "a")
    ]

    event_relationship = ""
    if sidebar:
        event_item = find_first(
            sidebar,
            lambda node: node.tag == "li" and normalized_text(text_content(node)).startswith("EVENT "),
        )
        if event_item:
            event_relationship = text_content(event_item)

    return {
        "title": text_content(title_node) if title_node else "",
        "canonical": canonical.attrs.get("href", "") if canonical else "",
        "metadata": metadata,
        "headings": headings,
        "body_structure": node_signature(article) if article else None,
        "body_text": text_content(article) if article else "",
        "code_blocks": code_blocks,
        "math_blocks": math_blocks,
        "links": links,
        "related_links": node_signature(related) if related else None,
        "writeup_event_link": node_signature(back) if back else None,
        "event_relationship": event_relationship,
    }


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass


def start_server(directory):
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(directory))
    )
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_port}"


def request(base_url, route):
    url = f"{base_url}/{quote(route.lstrip('/'), safe='/')}"
    try:
        with urlopen(url) as response:
            return response.status, response.read().decode("utf-8")
    except HTTPError as error:
        return error.code, error.read().decode("utf-8", errors="replace")
    except URLError as error:
        return 0, str(error.reason)


def preview(value):
    rendered = repr(value)
    return rendered if len(rendered) <= 260 else rendered[:257] + "..."


def main():
    astro_routes = json.loads(ASTRO_MANIFEST.read_text(encoding="utf-8"))
    old_routes = astro_routes
    old_server, old_url = start_server(DIST)
    astro_server, astro_url = start_server(DIST)
    differences = []
    matching_pages = 0
    status_counts = {"baseline": {}, "astro": {}}

    try:
        if old_routes != astro_routes:
            differences.append(
                {
                    "category": "ordering",
                    "path": "(article manifest)",
                    "expected": old_routes,
                    "actual": astro_routes,
                }
            )

        for route in old_routes:
            old_status, old_html = request(old_url, route)
            astro_status, astro_html = request(astro_url, route)
            for label, status in (("baseline", old_status), ("astro", astro_status)):
                key = str(status)
                status_counts[label][key] = status_counts[label].get(key, 0) + 1
            page_differences = []
            if old_status != 200 or astro_status != 200:
                page_differences.append(
                    {"category": "http_status", "expected": 200, "actual": {"baseline": old_status, "astro": astro_status}}
                )

            if old_status == 200 and astro_status == 200:
                expected = article_facts(old_html)
                actual = article_facts(astro_html)
                for category, expected_value in expected.items():
                    actual_value = actual[category]
                    if expected_value != actual_value:
                        page_differences.append(
                            {
                                "category": category,
                                "expected": preview(expected_value),
                                "actual": preview(actual_value),
                            }
                        )

            if page_differences:
                differences.extend({"path": route, **item} for item in page_differences)
            else:
                matching_pages += 1
    finally:
        old_server.shutdown()
        astro_server.shutdown()
        old_server.server_close()
        astro_server.server_close()

    report = {
        "baseline_pages": len(old_routes),
        "astro_pages": len(astro_routes),
        "matching_pages": matching_pages,
        "http_status_counts": status_counts,
        "difference_count": len(differences),
        "differences": differences,
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if differences:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
