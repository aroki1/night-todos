"""Serve a built Night Sky folder on localhost with the right .wasm type.
usage: python web/serve.py [DIR] [PORT]      (defaults: dist, 8080)
"""
import http.server, os, sys

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm", ".js": "text/javascript", ".webmanifest": "application/manifest+json"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

if __name__ == "__main__":
    root = sys.argv[1] if len(sys.argv) > 1 else "dist"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080
    os.chdir(root)
    print(f"night sky on http://localhost:{port}/")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
