import hashlib
import http.client
import json
from pathlib import Path
import subprocess
import threading
from unittest.mock import Mock
import pytest
import parser_service as service

TOKEN = 'a' * 48
PDF = b'%PDF-1.4 synthetic'


def successful(args, **_):
    Path(args[1]).write_text(json.dumps({'sourceSha256': hashlib.sha256(PDF).hexdigest(),
                                       'markdown': 'synthetic'}))
    return 0


@pytest.fixture
def server():
    server = service.ParserServer(('127.0.0.1', 0), TOKEN, successful)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    server.server_close()


def request(server, path='/internal/v1/parse', body=PDF, auth=True, method='POST', headers=None):
    connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=3)
    values = {'Content-Type': 'application/pdf'}
    if auth:
        values['Authorization'] = 'Bearer ' + TOKEN
    values.update(headers or {})
    connection.request(method, path, body, values)
    response = connection.getresponse()
    result = response.status, json.loads(response.read())
    connection.close()
    if result[0] != 429:
        assert server.capacity.acquire(timeout=1)
        server.capacity.release()
    return result


def test_health_auth_and_paths(server):
    assert request(server, '/health/live', method='GET')[0] == 200
    assert request(server, '/health/ready', method='GET')[0] == 503
    assert request(server, '/other', method='GET')[0] == 404
    assert request(server, '/other')[0] == 404
    assert request(server, auth=False)[0] == 401
    assert request(server)[0] == 503
    server.ready = True
    assert request(server, '/health/ready', method='GET')[0] == 200


@pytest.mark.parametrize('body,headers,status', [
    (b'short', {}, 400), (b'badbytes!', {}, 400),
    (PDF, {'Content-Type': 'text/plain'}, 400),
    (PDF, {'Transfer-Encoding': 'chunked'}, 400),
    (PDF, {'Content-Length': 'invalid'}, 400),
    (PDF, {'Content-Length': str(service.MAX_INPUT+1)}, 413)])
def test_input_bounds(server, body, headers, status):
    server.ready = True
    assert request(server, body=body, headers=headers)[0] == status


def test_conversion_and_busy_cleanup(server):
    server.ready = True
    seen = []
    def convert(args):
        seen.append(Path(args[0]).parent)
        return successful(args)
    server.runner = convert
    status, result = request(server)
    assert status == 200 and result['markdown'] == 'synthetic'
    assert server.capacity.acquire(timeout=1)
    server.capacity.release()
    assert all(not path.exists() for path in seen)
    server.capacity.acquire()
    assert request(server)[0] == 429
    server.capacity.release()


@pytest.mark.parametrize('code,status', [(13,413),(22,422),(50,503)])
def test_conversion_failure(server,code,status):
    server.ready=True
    server.runner=lambda _:code
    assert request(server)[0]==status
    assert server.capacity.acquire(timeout=1)
    server.capacity.release()


def test_bad_result_and_exception(server):
    server.ready=True
    server.runner=Mock(side_effect=RuntimeError('secret'))
    assert request(server)[0]==503
    def wrong(args):
        Path(args[1]).write_text('{"sourceSha256":"forged"}')
        return 0
    server.runner=wrong
    assert request(server)[0]==503
    def huge(args):
        Path(args[1]).write_bytes(b'x'*(service.MAX_OUTPUT+1))
        return 0
    server.runner=huge
    assert request(server)[0]==413


def test_timeout_kills_process_group(monkeypatch):
    child=Mock(pid=123)
    child.wait.side_effect=[subprocess.TimeoutExpired('converter',40),0]
    monkeypatch.setattr(service.subprocess,'Popen',Mock(return_value=child))
    kill=Mock()
    monkeypatch.setattr(service.os,'killpg',kill)
    assert service.run_conversion(['in','out'])==50
    kill.assert_called_once_with(123,service.signal.SIGKILL)
    child.wait.side_effect=None
    child.wait.return_value=0
    assert service.run_conversion(['in','out'])==0


def test_empty_credential():
    with pytest.raises(ValueError):
        service.ParserServer(('127.0.0.1',0),'')
