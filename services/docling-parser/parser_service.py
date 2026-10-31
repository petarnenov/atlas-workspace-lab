"""Narrow, authenticated PDF endpoint. No URLs, storage, DB or plugin inputs."""
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import uuid

MAX_INPUT = 5 * 1024 * 1024
MAX_OUTPUT = 10 * 1024 * 1024
SCRIPT = str(Path(__file__).with_name('convert.py'))


def run_conversion(args, timeout=40):
    child = subprocess.Popen([sys.executable, SCRIPT, *args], stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        return child.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(child.pid, signal.SIGKILL)
        child.wait()
        return 50


class ParserServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8

    def __init__(self, address, token, runner=run_conversion):
        if not token or len(token) < 32:
            raise ValueError('Dedicated parser credential required')
        self.token = token
        self.runner = runner
        self.capacity = threading.BoundedSemaphore(1)
        self.ready = False
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    # Disable access logging: no tokens, paths, document content or raw errors.
    def log_message(self, *_):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(50)

    def reply(self, status, data=None):
        data = data if data is not None else {'code': 'REJECTED', 'correlationId': str(uuid.uuid4())}
        encoded = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(encoded)))
        self.send_header('Connection', 'close')
        self.end_headers()
        self.close_connection = True
        try:
            self.wfile.write(encoded)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if self.path == '/health/live':
            self.reply(200, {'status': 'up'})
        elif self.path == '/health/ready':
            self.reply(200 if self.server.ready else 503, {'ready': self.server.ready})
        else:
            self.reply(404)

    def do_POST(self):
        if self.path != '/internal/v1/parse':
            return self.reply(404)
        expected = ('Bearer ' + self.server.token).encode()
        if not hmac.compare_digest(self.headers.get('Authorization', '').encode(), expected):
            return self.reply(401)
        if not self.server.ready:
            return self.reply(503)
        if self.headers.get('Content-Type') != 'application/pdf' or self.headers.get('Transfer-Encoding'):
            return self.reply(400)
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return self.reply(400)
        if length > MAX_INPUT:
            return self.reply(413)
        if length < 8:
            return self.reply(400)
        if not self.server.capacity.acquire(blocking=False):
            return self.reply(429)
        try:
            data = self.rfile.read(length)
            if len(data) != length or not data.startswith(b'%PDF-'):
                return self.reply(400)
            with tempfile.TemporaryDirectory(prefix='atlas-parse-') as directory:
                source, target = Path(directory) / 'input.pdf', Path(directory) / 'output.json'
                source.write_bytes(data)
                code = self.server.runner([str(source), str(target)])
                if code != 0:
                    return self.reply({13: 413, 22: 422}.get(code, 503))
                if target.stat().st_size > MAX_OUTPUT:
                    return self.reply(413)
                result = json.loads(target.read_bytes())
                if result.get('sourceSha256') != hashlib.sha256(data).hexdigest():
                    return self.reply(503)
                return self.reply(200, result)
        except Exception:
            return self.reply(503)
        finally:
            self.server.capacity.release()


def main():
    token_path = os.environ.get('PARSER_TOKEN_FILE', '/keys/parser-token')
    token = os.environ.get('PARSER_TOKEN') or Path(token_path).read_text().strip()
    server = ParserServer(('0.0.0.0', 8083), token)
    def warmup():
        server.ready = server.runner(['--warmup'], timeout=180) == 0
    threading.Thread(target=warmup, daemon=True).start()
    server.serve_forever()


if __name__ == '__main__':
    main()
