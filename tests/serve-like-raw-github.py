#!/usr/bin/env python3
"""Serve the repository over HTTP the way raw.githubusercontent.com does.

The only thing that matters here is the Content-Type for .wasm. Python's
http.server reports application/wasm, but raw.githubusercontent.com — the
host this project documents for Deno imports — reports
application/octet-stream, and WebAssembly.instantiateStreaming rejects
anything that is not application/wasm.

Serving it "correctly" is what let a broken Deno import ship: the local
check passed while the documented URL failed.

    python3 tests/serve-like-raw-github.py 8731
"""

import http.server
import sys

handler = http.server.SimpleHTTPRequestHandler
handler.extensions_map = dict(handler.extensions_map)
handler.extensions_map[".wasm"] = "application/octet-stream"

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
http.server.HTTPServer(("127.0.0.1", port), handler).serve_forever()
