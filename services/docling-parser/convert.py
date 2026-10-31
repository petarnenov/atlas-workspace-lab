"""Isolated offline converter. Invoked only with private local scratch paths."""
import hashlib
import importlib.metadata
import json
import logging
import os
from pathlib import Path
import sys

MAX_OUTPUT = 10 * 1024 * 1024
PIPELINE = 'atlas-pdf-v1-heron8f39ad3c-tablefc0f2d45-ocr-off'


def converter():
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption
    options = PdfPipelineOptions(artifacts_path=Path(os.environ.get('MODEL_PATH', '/models')))
    options.do_ocr = False
    options.do_picture_description = False
    options.do_code_enrichment = False
    options.do_formula_enrichment = False
    options.generate_page_images = False
    options.generate_picture_images = False
    options.accelerator_options.num_threads = 2
    engine = DocumentConverter(allowed_formats=[InputFormat.PDF],
                              format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})
    engine.initialize_pipeline(InputFormat.PDF)
    return engine


def convert(source, target, engine=None):
    import pypdfium2 as pdfium
    # Reject encryption and bound pages before the expensive model pipeline.
    try:
        with pdfium.PdfDocument(source) as pdf:
            if pdfium.raw.FPDF_GetSecurityHandlerRevision(pdf.raw) != -1:
                return 22
            pages = len(pdf)
            if pages < 1 or pages > 20:
                return 22
    except Exception:
        return 22
    result = (engine or converter()).convert(Path(source), max_num_pages=20,
                                            max_file_size=5 * 1024 * 1024)
    if result.status.value != 'success':
        return 50
    markdown = result.document.export_to_markdown()
    if not markdown.strip():
        return 50
    payload = dict(sourceSha256=hashlib.sha256(Path(source).read_bytes()).hexdigest(),
                   parserVersion=importlib.metadata.version('docling'), pipelineVersion=PIPELINE,
                   pageCount=pages, markdown=markdown, document=result.document.export_to_dict())
    encoded = json.dumps(payload, ensure_ascii=False).encode()
    if len(encoded) > MAX_OUTPUT:
        return 13
    Path(target).write_bytes(encoded)
    return 0


def main(args):
    logging.disable(logging.CRITICAL)
    try:
        if args == ['--warmup']:
            root = Path(os.environ.get('MODEL_PATH', '/models'))
            manifest = json.loads((root / 'sha256.json').read_text())
            if not manifest or any(hashlib.sha256((root / name).read_bytes()).hexdigest() != digest
                                   for name, digest in manifest.items()):
                return 50
            converter()
            return 0
        return convert(*args)
    except Exception:
        return 50


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
