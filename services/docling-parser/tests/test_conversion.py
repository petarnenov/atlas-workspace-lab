import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
import pypdfium2
import pytest
import convert


def pdf(stream):
    objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
             '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
             '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
             f'<< /Length {len(stream)} >>\nstream\n{stream}\nendstream']
    body='%PDF-1.4\n'
    offsets=[]
    for index,obj in enumerate(objects):
        offsets.append(len(body));body+=f'{index+1} 0 obj\n{obj}\nendobj\n'
    xref=len(body)
    body+='xref\n0 6\n0000000000 65535 f \n'+''.join(f'{n:010} 00000 n \n' for n in offsets)
    return (body+f'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n').encode()


@pytest.fixture
def source(tmp_path):
    path=tmp_path/'input.pdf'
    path.write_bytes(pdf('BT /F1 18 Tf 50 740 Td (Atlas independent heading) Tj 0 -30 Td /F1 12 Tf (First paragraph before table.) Tj ET'))
    return path


def test_converter_errors_and_bounds(source,tmp_path,monkeypatch):
    target=tmp_path/'out.json'
    doc=Mock()
    doc.export_to_markdown.return_value='expected text'
    doc.export_to_dict.return_value={'schema_name':'DoclingDocument','version':'1.0.0'}
    result=SimpleNamespace(status=SimpleNamespace(value='success'),document=doc)
    engine=Mock();engine.convert.return_value=result
    assert convert.convert(source,target,engine)==0
    data=json.loads(target.read_text())
    assert data['sourceSha256']==hashlib.sha256(source.read_bytes()).hexdigest()
    assert data['markdown']=='expected text'
    result.status.value='failure'
    assert convert.convert(source,target,engine)==50
    result.status.value='success';doc.export_to_markdown.return_value=' '
    assert convert.convert(source,target,engine)==50
    doc.export_to_markdown.return_value='x'*(convert.MAX_OUTPUT+1)
    assert convert.convert(source,target,engine)==13
    source.write_bytes(b'not PDF')
    assert convert.convert(source,target,engine)==22
    fake=Mock();fake.__enter__=Mock(return_value=fake);fake.__exit__=Mock(return_value=False);fake.__len__=Mock(return_value=21)
    monkeypatch.setattr(pypdfium2,'PdfDocument',lambda _:fake)
    assert convert.convert(source,target,engine)==22
    monkeypatch.setattr(convert,'convert',Mock(side_effect=ValueError('sensitive')))
    assert convert.main(['in','out'])==50


def test_model_manifest_rejection(tmp_path,monkeypatch):
    monkeypatch.setenv('MODEL_PATH',str(tmp_path))
    (tmp_path/'sha256.json').write_text('{}')
    assert convert.main(['--warmup'])==50


def test_real_offline_text_and_table_quality(tmp_path):
    # Expected labels/order/cells are hand-authored, independent of converter output.
    stream='BT /F1 18 Tf 50 740 Td (Atlas independent heading) Tj 0 -30 Td /F1 12 Tf (First paragraph before table.) Tj ET\n'
    for y in [650,620,590]:
        stream+=f'50 {y} m 350 {y} l S\n'
    for x in [50,200,350]:
        stream+=f'{x} 590 m {x} 650 l S\n'
    for x,y,text in [(60,630,'Item'),(210,630,'Count'),(60,600,'Apples'),(210,600,'7')]:
        stream+=f'BT /F1 12 Tf {x} {y} Td ({text}) Tj ET\n'
    source,target=tmp_path/'quality.pdf',tmp_path/'result.json'
    source.write_bytes(pdf(stream))
    assert convert.main([str(source),str(target)])==0
    result=json.loads(target.read_text())
    text=result['markdown']
    assert 'Atlas independent heading' in text and 'First paragraph before table.' in text
    assert text.index('Atlas independent heading')<text.index('First paragraph')<text.index('Apples')
    assert result['document']['tables']
    assert 'Item' in text and 'Count' in text and '7' in text
