# Packet forge — frozen spec

Internal spec for Wave 3 project 24. Vanilla HTML/CSS/JS. Persist to `localStorage` key `packet-forge-v1`.

## Product

Ethernet / IPv4 / TCP / UDP / ICMP fields on one side, hex dump on the other. Checksums and length fields recompute. Import/export hex. Lives at `packet-forge/index.html`.

Flip a flag in the form and the hex byte must move. Checksum mismatch is visible.

## Layout (Session A)

Bytes are big-endian.

- Ethernet: dst MAC (6), src MAC (6), ethertype (2) — `0x0800` IPv4
- IPv4: version/IHL, TOS, total length, id, flags/frag, TTL, protocol, checksum, src, dst, options if IHL>5 (Session A: IHL=5 only)
- UDP: src port, dst port, length, checksum (optional; 0 means unused)
- TCP: src, dst, seq, ack, data offset, flags (URG ACK PSH RST SYN FIN), window, checksum, urg, payload
- ICMP (Session C): type (1), code (1), checksum (2), rest-of-header (4), payload

Payload is raw bytes after the transport / ICMP header. Protocol field selects TCP (6), UDP (17), or ICMP (1).

IPv4 header checksum: ones' complement of 16-bit words of the IP header. TCP/UDP checksum: IPv4 pseudo-header + segment. ICMP checksum: ones' complement of the ICMP message only (no pseudo-header).

## Session A must

- Form editors for Ethernet + IPv4 + (TCP or UDP) + payload hex
- Live hex dump; clicking a byte selects the field; editing a field updates hex
- Auto-recompute length + checksums (toggle “lock checksum” to show mismatch)
- Import hex / export hex
- ≥ 2 presets (TCP SYN, UDP DNS-ish)
- Hash `#/p/<presetId>`
- Reset
- Hub link `../`

## Session C must

- ICMP over IPv4 (protocol 1). Form: type, code, checksum, rest-of-header (4 bytes), payload hex
- Ethernet + IPv4 + ICMP encode/decode
- ICMP checksum: ones' complement of the ICMP message (no TCP-style pseudo-header)
- IPv4 header checksum still ones' complement of the IP header
- Lock checksum still shows mismatch (Session B)
- Presets `tcp-syn` and `udp-dns` still build identical IPv4/TCP and IPv4/UDP packets
- Preset `icmp-echo` (type 8, code 0), hash `#/p/icmp-echo`
- Protocol dropdown includes `1 — ICMP`; hide TCP/UDP sections, show ICMP

## Out of scope (later sessions)

IPv6, VLAN, options.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
