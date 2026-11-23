#!/usr/bin/env python3
import http.server, socketserver, urllib.request, urllib.parse, webbrowser, os, sys

PORT = int(os.environ.get("PORT", 8787))
ALLOWED_HOSTS = {"query1.finance.yahoo.com", "query2.finance.yahoo.com", "news.google.com", "www.bing.com"}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".html": "text/html; charset=utf-8",
    }

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/proxy":
            if not os.path.exists(self.translate_path(parsed.path)):
                body = open("404.html", "rb").read()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            return super().do_GET()
        target = urllib.parse.parse_qs(parsed.query).get("url", [""])[0]
        t = urllib.parse.urlparse(target)
        if t.scheme != "https" or t.hostname not in ALLOWED_HOSTS:
            return self.send_error(403, "Host nicht erlaubt")
        try:
            req = urllib.request.Request(target, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=15) as r:
                body, status, ctype = r.read(), r.status, r.headers.get("Content-Type", "text/plain")
        except urllib.error.HTTPError as e:
            body, status, ctype = e.read(), e.code, e.headers.get("Content-Type", "text/plain")
        except Exception as e:
            return self.send_error(502, str(e))
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print(f"QuantLite läuft auf {url}  (Beenden: Strg+C)")
        if "--no-browser" not in sys.argv:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
