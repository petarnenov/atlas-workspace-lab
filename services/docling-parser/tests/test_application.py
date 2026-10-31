import hashlib
from dataclasses import replace
from unittest.mock import Mock
import pytest
from application.document import Conversion, ParseDocument, Rejected, TooLarge
from test_service import request, server

PDF=b'%PDF-1.4 synthetic'


def output():
    return Conversion(hashlib.sha256(PDF).hexdigest(),1,'synthetic','fixture-1','fixture-1')


def test_port_substitution_and_validation():
    converter=Mock()
    converter.convert.return_value=output()
    use_case=ParseDocument(converter)
    assert use_case.parse(PDF).native is None
    converter.reset_mock()
    with pytest.raises(Rejected):
        use_case.parse(b'bad')
    with pytest.raises(TooLarge):
        use_case.parse(b'x'*(5*1024*1024+1))
    converter.convert.assert_not_called()
    for patch in [dict(source_hash='forged'),dict(pages=0),dict(pages=21),dict(pages=True),
                  dict(markdown=' '),dict(markdown=None),dict(converter_revision=''),
                  dict(pipeline_revision='x'*129)]:
        converter.convert.return_value=replace(output(),**patch)
        with pytest.raises(Rejected):
            use_case.parse(PDF)


def test_neutral_http_and_opaque_optional_native(server):
    import importlib.metadata
    import json
    from pathlib import Path
    from convert import PIPELINE
    def run(args):
        Path(args[1]).write_text(json.dumps(dict(sourceSha256=output().source_hash,
            pageCount=1,markdown='synthetic',parserVersion=importlib.metadata.version('docling'),
            pipelineVersion=PIPELINE,document=dict(schema_name='DoclingDocument',version='1.0.0'))))
        return 0
    server.ready=True
    server.runner=run
    status,result=request(server,path='/internal/v2/parse')
    assert status==200
    assert result['document']==dict(schemaVersion='1',markdown='synthetic')
    assert result['native']['mediaType']=='application/json'
    assert 'parserVersion' not in result


def test_http_invokes_startup_selected_converter_without_concrete_binding():
    import threading
    import parser_service as service
    from test_service import TOKEN

    class Alternate:
        def convert(self, data):
            assert data == PDF
            return output()

    converter = Alternate()
    instance = service.ParserServer(('127.0.0.1', 0), TOKEN, converter=converter)
    instance.ready = True
    thread = threading.Thread(target=instance.serve_forever, daemon=True)
    thread.start()
    try:
        assert instance.application.converter is converter
        status, result = request(instance, path='/internal/v2/parse')
        assert status == 200
        assert result['document'] == dict(schemaVersion='1', markdown='synthetic')
        assert 'native' not in result
        assert request(instance, path='/internal/v1/parse')[0] == 503
    finally:
        instance.shutdown()
        instance.server_close()
    with pytest.raises(ValueError, match='converter'):
        service.ParserServer(('127.0.0.1', 0), TOKEN, converter=object())
