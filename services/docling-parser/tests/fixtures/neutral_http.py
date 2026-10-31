"""Ephemeral black-box contract fixture; never installed in runtime images."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import json
import os
from pathlib import Path


class NeutralHandler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, status, value):
        data = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.reply(200 if self.path in ('/health/ready', '/health/live') else 404, {})

    def do_POST(self):
        token = Path(os.environ['PARSER_TOKEN_FILE']).read_text().strip()
        if self.headers.get('Authorization') != 'Bearer ' + token:
            return self.reply(401, {})
        length = int(self.headers.get('Content-Length', '0'))
        if self.path != '/internal/v2/parse' or not 0 < length <= 5 * 1024 * 1024:
            return self.reply(400, {})
        source = self.rfile.read(length)
        # There is deliberately no Docling import, native schema or provider option.
        self.reply(200, {'sourceSha256': hashlib.sha256(source).hexdigest(),
                         'pageCount': 1,
                         'document': {'schemaVersion': '1', 'markdown': 'Alternate converter saved document'},
                         'provenance': {'converter': 'alternate-fixture', 'pipeline': 'plain-v1'}})


ThreadingHTTPServer(('0.0.0.0', 8083), NeutralHandler).serve_forever()
