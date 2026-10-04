import json, sys, ipaddress as ia
out = []
for s in json.load(sys.stdin):
    try:
        a = ia.IPv6Address(s)
        out.append({
      'compressed': a.compressed, 'exploded': a.exploded, 'reverse': a.reverse_pointer,
      'loop': a.is_loopback, 'unspec': a.is_unspecified, 'multi': a.is_multicast, 'll': a.is_link_local,
      'mapped': str(a.ipv4_mapped) if a.ipv4_mapped else None,
      'sixtofour': str(a.sixtofour) if a.sixtofour else None,
      'teredo': [str(x) for x in a.teredo] if a.teredo else None,
        })
    except Exception:
        out.append(None)
json.dump(out, sys.stdout)
