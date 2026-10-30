from http.server import BaseHTTPRequestHandler, HTTPServer
import io
import os
from types import SimpleNamespace
import threading
import stdio_bridge


def test_bridge_relays_http_without_a_host_port(monkeypatch):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            assert self.headers['Authorization'] == 'Bearer synthetic'
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'Expected saved text')
        def log_message(self,*_):
            pass
    server=HTTPServer(('127.0.0.1',8083),Handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    output=io.BytesIO()
    read_fd,write_fd=os.pipe()
    os.write(write_fd,b'GET /health/live HTTP/1.0\r\nAuthorization: Bearer synthetic\r\n\r\n')
    os.close(write_fd)
    monkeypatch.setattr(stdio_bridge.sys,'stdin',SimpleNamespace(fileno=lambda:read_fd))
    monkeypatch.setattr(stdio_bridge.sys,'stdout',SimpleNamespace(buffer=output))
    try:
        stdio_bridge.main()
        assert b'200 OK' in output.getvalue()
        assert b'Expected saved text' in output.getvalue()
    finally:
        os.close(read_fd)
        server.shutdown()
        server.server_close()
