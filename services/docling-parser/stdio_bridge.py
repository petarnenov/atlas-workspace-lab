"""Local Compose fixture only: pipe HTTP to the isolated parser's loopback socket."""
import os
import socket
import sys
import threading


def main():
    with socket.create_connection(('127.0.0.1', 8083), timeout=5) as connection:
        connection.settimeout(50)
        def upload():
            try:
                while data := os.read(sys.stdin.fileno(), 65536):
                    connection.sendall(data)
                connection.shutdown(socket.SHUT_WR)
            except OSError:
                pass
        threading.Thread(target=upload, daemon=True).start()
        while data := connection.recv(65536):
            sys.stdout.buffer.write(data)
            sys.stdout.buffer.flush()


if __name__ == '__main__':
    main()
