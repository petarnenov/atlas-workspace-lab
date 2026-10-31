"""Provider-independent processing policy and converter port."""
from dataclasses import dataclass
import hashlib
from typing import Protocol


class Rejected(Exception):
    pass


class Unavailable(Exception):
    pass


class TooLarge(Rejected):
    pass


@dataclass(frozen=True)
class Conversion:
    source_hash: str
    pages: int
    markdown: str
    converter_revision: str
    pipeline_revision: str
    native: dict | None = None


class Converter(Protocol):
    def convert(self, data: bytes) -> Conversion: ...


class ParseDocument:
    def __init__(self, converter: Converter):
        self.converter = converter

    def parse(self, data: bytes) -> Conversion:
        if len(data) > 5 * 1024 * 1024:
            raise TooLarge()
        if len(data) < 8 or not data.startswith(b'%PDF-'):
            raise Rejected()
        result = self.converter.convert(data)
        if (result.source_hash != hashlib.sha256(data).hexdigest()
                or type(result.pages) is not int or not 1 <= result.pages <= 20
                or not isinstance(result.markdown, str) or not result.markdown.strip()
                or any(not isinstance(value, str) or not 1 <= len(value) <= 128
                       for value in [result.converter_revision, result.pipeline_revision])):
            raise Rejected()
        return result
