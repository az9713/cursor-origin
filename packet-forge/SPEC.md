# Packet forge — frozen spec

Internal spec for Wave 3 project 24. Vanilla HTML/CSS/JS. Persist to `localStorage` key `packet-forge-v1`.

## Product

Ethernet / IPv4 / TCP / UDP fields on one side, hex dump on the other. Checksums and length fields recompute. Import/export hex. Lives at `packet-forge/index.html`.

Flip a flag in the form and the hex byte must move. Checksum mismatch is visible.

## Layout (Session A)

Bytes are big-endian.

- Ethernet: dst MAC (6), src MAC (6), ethertype (2) — `0x0800` IPv4
- IPv4: version/IHL, TOS, total length, id, flags/frag, TTL, protocol, checksum, src, dst, options if IHL>5 (Session A: IHL=5 only)
- UDP: src port, dst port, length, checksum (optional; 0 means unused)
- TCP: src, dst, seq, ack, data offset, flags (URG ACK PSH RST SYN FIN), window, checksum, urg, payload

Payload is raw bytes after the transport header. Protocol field selects TCP (6) or UDP (17).

IPv4 header checksum: ones' complement of 16-bit words. TCP/UDP checksum: pseudo-header + segment (IPv4).

## Session A must

- Form editors for Ethernet + IPv4 + (TCP or UDP) + payload hex
- Live hex dump; clicking a byte selects the field; editing a field updates hex
- Auto-recompute length + checksums (toggle “lock checksum” to show mismatch)
- Import hex / export hex
- ≥ 2 presets (TCP SYN, UDP DNS-ish)
- Hash `#/p/<presetId>`
- Reset
- Hub link `../`

## Out of scope (later sessions)

ICMP, IPv6, VLAN, options.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
