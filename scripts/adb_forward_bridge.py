#!/usr/bin/env python3
"""
ADB Port Forward Bridge for Docker DevContainers.

When ADB_SERVER_SOCKET points to host.docker.internal:5037, host ADB
binds forwarded ports (from `adb forward tcp:PORT ...`) to the HOST machine's
network namespace. Because the devcontainer has an isolated network namespace,
Flutter CLI fails with 'Connection refused' when attempting to connect to 127.0.0.1:PORT.

This daemon continuously monitors `adb forward --list` and automatically
bridges local container 127.0.0.1:PORT -> host.docker.internal:PORT.
"""

import os
import re
import socket
import subprocess
import sys
import threading
import time

HOST_NAME = os.environ.get("ADB_FORWARD_HOST", "host.docker.internal")
CHECK_INTERVAL = 0.5

active_servers = {}  # port -> stop_event
running = True


def resolve_host_ip():
    try:
        # Resolve to IPv4 specifically to prevent IPv6 connection refused issues
        infos = socket.getaddrinfo(HOST_NAME, None, socket.AF_INET)
        if infos:
            return infos[0][4][0]
    except Exception:
        pass
    return HOST_NAME


HOST_IP = resolve_host_ip()


def forward_stream(source, destination):
    try:
        while running:
            data = source.recv(65536)
            if not data:
                break
            destination.sendall(data)
    except Exception:
        pass
    finally:
        try:
            source.shutdown(socket.SHUT_RDWR)
            source.close()
        except Exception:
            pass
        try:
            destination.shutdown(socket.SHUT_RDWR)
            destination.close()
        except Exception:
            pass


def handle_client(client_sock, target_port):
    target_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        target_sock.settimeout(5.0)
        target_sock.connect((HOST_IP, target_port))
        target_sock.settimeout(None)
    except Exception:
        client_sock.close()
        target_sock.close()
        return

    t1 = threading.Thread(target=forward_stream, args=(client_sock, target_sock), daemon=True)
    t2 = threading.Thread(target=forward_stream, args=(target_sock, client_sock), daemon=True)
    t1.start()
    t2.start()


def run_bridge_server(port, stop_event):
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        srv.bind(("127.0.0.1", port))
        srv.listen(128)
        srv.settimeout(0.5)
    except Exception:
        srv.close()
        return

    while running and not stop_event.is_set():
        try:
            client_sock, _ = srv.accept()
            client_thread = threading.Thread(target=handle_client, args=(client_sock, port), daemon=True)
            client_thread.start()
        except socket.timeout:
            continue
        except Exception:
            break

    try:
        srv.close()
    except Exception:
        pass


def get_forwarded_ports():
    try:
        res = subprocess.run(
            ["adb", "forward", "--list"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=2.0,
        )
        if res.returncode != 0:
            return set()
        ports = set()
        for line in res.stdout.strip().splitlines():
            # format: <serial> tcp:<local_port> tcp:<remote_port>
            parts = line.split()
            if len(parts) >= 2:
                m = re.match(r"^tcp:(\d+)$", parts[1])
                if m:
                    ports.add(int(m.group(1)))
        return ports
    except Exception:
        return set()


def main():
    global HOST_IP
    print(f"[ADB Bridge] Starting bridge daemon (Host: {HOST_NAME} -> {HOST_IP})...", flush=True)

    while running:
        # Periodically refresh host IP in case of network changes
        current_ip = resolve_host_ip()
        if current_ip:
            HOST_IP = current_ip

        desired_ports = get_forwarded_ports()

        # Start listeners for new ports
        for port in desired_ports:
            if port not in active_servers:
                stop_event = threading.Event()
                t = threading.Thread(target=run_bridge_server, args=(port, stop_event), daemon=True)
                t.start()
                active_servers[port] = stop_event
                print(f"[ADB Bridge] Bridging 127.0.0.1:{port} -> {HOST_IP}:{port}", flush=True)

        # Stop listeners for removed ports
        for port in list(active_servers.keys()):
            if port not in desired_ports:
                print(f"[ADB Bridge] Stopping bridge for port {port}", flush=True)
                active_servers[port].set()
                del active_servers[port]

        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        running = False
        print("[ADB Bridge] Shutting down...", flush=True)
