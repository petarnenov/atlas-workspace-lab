"""Fixed subprocess converter and legacy provider response compatibility."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import tempfile
from application.document import Conversion, Rejected, TooLarge, Unavailable
from convert import PIPELINE


class IsolatedConverter:
    def __init__(self, runner):
        self.runner = runner

    def legacy(self, data):
        with tempfile.TemporaryDirectory(prefix='atlas-parse-') as directory:
            source, target = Path(directory) / 'input.pdf', Path(directory) / 'output.json'
            source.write_bytes(data)
            code = self.runner([str(source), str(target)])
            if code == 13:
                raise TooLarge()
            if code == 22:
                raise Rejected()
            if code != 0:
                raise Unavailable()
            if target.stat().st_size > 10 * 1024 * 1024:
                raise TooLarge()
            result = json.loads(target.read_bytes())
            if result.get('sourceSha256') != hashlib.sha256(data).hexdigest():
                raise Unavailable()
            return result

    def convert(self, data):
        result = self.legacy(data)
        native = result.get('document')
        if (result.get('parserVersion') != importlib.metadata.version('docling')
                or result.get('pipelineVersion') != PIPELINE
                or not isinstance(native, dict)
                or native.get('schema_name') != 'DoclingDocument'
                or not isinstance(native.get('version'), str)
                or not native['version'].startswith('1.')):
            raise Rejected()
        return Conversion(result['sourceSha256'], result.get('pageCount'), result.get('markdown'),
                          result['parserVersion'], result['pipelineVersion'], native)
